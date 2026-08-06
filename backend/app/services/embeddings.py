import hashlib
import logging
import math
import os
import random
import re
import time
from functools import lru_cache
from pathlib import Path

from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI, RateLimitError


HASH_DIMENSIONS = 384
DEFAULT_LOCAL_MODEL = "BAAI/bge-m3"
DEFAULT_MODEL_CACHE = Path(__file__).resolve().parents[2] / "data" / "models"
DEFAULT_API_BATCH_SIZE = 64
DEFAULT_API_MAX_RETRIES = 3

logger = logging.getLogger(__name__)


def embedding_mode() -> str:
    mode = os.getenv("EMBEDDING_MODE", "local").lower()
    if mode not in {"hash", "local", "api"}:
        raise ValueError("EMBEDDING_MODE 必须是 hash、local 或 api。")
    return mode


def embedding_model() -> str:
    if embedding_mode() == "hash":
        return "hash-v1"
    return os.getenv("EMBEDDING_MODEL", DEFAULT_LOCAL_MODEL)


def embedding_provider() -> str:
    if embedding_mode() == "hash":
        return "builtin"
    return os.getenv("EMBEDDING_PROVIDER", "sentence-transformers")


def _hash_embedding(text: str) -> list[float]:
    vector = [0.0] * HASH_DIMENSIONS
    normalized = text.lower()
    features = re.findall(r"[a-z0-9_]+|[\u4e00-\u9fff]", normalized)
    features += [normalized[index:index + 2] for index in range(max(0, len(normalized) - 1))]
    for feature in features:
        digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
        bucket = int.from_bytes(digest, "big") % HASH_DIMENSIONS
        vector[bucket] += -1.0 if digest[0] & 1 else 1.0
    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / norm for value in vector]


@lru_cache(maxsize=2)
def _local_model(model_name: str):
    cache_folder = Path(os.getenv("EMBEDDING_CACHE_DIR", str(DEFAULT_MODEL_CACHE)))
    cache_folder.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("HF_HOME", str(cache_folder))
    os.environ.setdefault("HF_XET_CACHE", str(cache_folder / "xet"))
    os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

    from sentence_transformers import SentenceTransformer

    model_cache = cache_folder / f"models--{model_name.replace('/', '--')}"
    cached_ref = model_cache / "refs" / "main"
    model_source = model_name
    if cached_ref.exists():
        revision = cached_ref.read_text(encoding="utf-8").strip()
        cached_snapshot = model_cache / "snapshots" / revision
        if cached_snapshot.exists():
            model_source = str(cached_snapshot)
    return SentenceTransformer(
        model_source,
        cache_folder=str(cache_folder),
        local_files_only=model_source != model_name,
    )


def _positive_int(name: str, default: int) -> int:
    raw_value = os.getenv(name, str(default))
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} 必须是整数。") from exc
    if value <= 0:
        raise ValueError(f"{name} 必须大于 0。")
    return value


def _retry_delay(error: Exception, attempt: int) -> float:
    if isinstance(error, APIStatusError):
        retry_after = error.response.headers.get("retry-after")
        if retry_after:
            try:
                return min(float(retry_after), 30.0)
            except ValueError:
                pass
    return min(2**attempt + random.uniform(0, 0.25), 8.0)


def _api_error_detail(error: Exception) -> str:
    if isinstance(error, APIStatusError):
        message = ""
        if isinstance(error.body, dict):
            payload = error.body.get("detail") or error.body.get("message") or error.body.get("error")
            if isinstance(payload, dict):
                message = str(payload.get("message", ""))
            elif payload:
                message = str(payload)
        suffix = f"：{message}" if message else ""
        return f"HTTP {error.status_code}{suffix}"
    if isinstance(error, APITimeoutError):
        return "请求超时"
    if isinstance(error, APIConnectionError):
        return "网络连接失败"
    return type(error).__name__


def _api_embeddings(texts: list[str], *, is_query: bool) -> list[list[float]]:
    api_key = os.getenv("EMBEDDING_API_KEY")
    if not api_key:
        raise RuntimeError("EMBEDDING_MODE=api 时必须配置 EMBEDDING_API_KEY。")

    client = OpenAI(
        api_key=api_key,
        base_url=os.getenv("EMBEDDING_BASE_URL", "https://api.voyageai.com/v1"),
        max_retries=0,
        timeout=30.0,
    )
    batch_size = _positive_int("EMBEDDING_BATCH_SIZE", DEFAULT_API_BATCH_SIZE)
    max_retries = _positive_int("EMBEDDING_MAX_RETRIES", DEFAULT_API_MAX_RETRIES)
    embeddings: list[list[float]] = []

    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        batch_number = start // batch_size + 1
        total_batches = (len(texts) + batch_size - 1) // batch_size
        logger.info(
            "Embedding API 批次 %d/%d：%d 个文本，input_type=%s",
            batch_number,
            total_batches,
            len(batch),
            "query" if is_query else "document",
        )
        for attempt in range(max_retries + 1):
            try:
                response = client.embeddings.create(
                    model=embedding_model(),
                    input=batch,
                    extra_body={"input_type": "query" if is_query else "document"},
                )
                ordered = sorted(response.data, key=lambda item: item.index)
                embeddings.extend(item.embedding for item in ordered)
                break
            except (RateLimitError, APITimeoutError, APIConnectionError, APIStatusError) as exc:
                retryable = not isinstance(exc, APIStatusError) or exc.status_code >= 500 or exc.status_code == 429
                if not retryable or attempt >= max_retries:
                    detail = _api_error_detail(exc)
                    logger.error(
                        "Embedding API 批次 %d/%d 失败（尝试 %d/%d）：%s",
                        batch_number,
                        total_batches,
                        attempt + 1,
                        max_retries + 1,
                        detail,
                    )
                    raise RuntimeError(f"Embedding API 请求失败（{detail}）") from exc
                logger.warning(
                    "Embedding API 批次 %d/%d 暂时失败，准备重试 %d/%d：%s",
                    batch_number,
                    total_batches,
                    attempt + 1,
                    max_retries,
                    _api_error_detail(exc),
                )
                time.sleep(_retry_delay(exc, attempt))

    return embeddings


def embed_texts(texts: list[str], *, is_query: bool = False) -> list[list[float]]:
    mode = embedding_mode()
    if mode == "hash":
        return [_hash_embedding(text) for text in texts]

    if mode == "local":
        model_name = embedding_model()
        prefix = ("query: " if is_query else "passage: ") if "e5" in model_name.lower() else ""
        vectors = _local_model(model_name).encode(
            [prefix + text for text in texts], normalize_embeddings=True
        )
        return vectors.tolist()

    return _api_embeddings(texts, is_query=is_query)
