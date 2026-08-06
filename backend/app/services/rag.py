import logging
import os
import re
import uuid
from pathlib import Path

import chromadb
from pypdf import PdfReader

from app.services.embeddings import embed_texts, embedding_mode, embedding_model


DB_PATH = Path(__file__).resolve().parents[2] / "data" / "chroma"
COLLECTION_NAME = "technical_materials"
DEFAULT_CHUNK_SIZE = 1200
DEFAULT_CHUNK_OVERLAP = 180
DEFAULT_TOP_K = 5

logger = logging.getLogger(__name__)


def _positive_int(name: str, default: int) -> int:
    raw_value = os.getenv(name, str(default))
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} 必须是整数，当前值为 {raw_value!r}。") from exc
    if value <= 0:
        raise ValueError(f"{name} 必须大于 0。")
    return value


def chunk_settings() -> tuple[int, int]:
    size = _positive_int("CHUNK_SIZE", DEFAULT_CHUNK_SIZE)
    overlap = int(os.getenv("CHUNK_OVERLAP", str(DEFAULT_CHUNK_OVERLAP)))
    if overlap < 0:
        raise ValueError("CHUNK_OVERLAP 不能小于 0。")
    if overlap >= size:
        raise ValueError("CHUNK_OVERLAP 必须小于 CHUNK_SIZE。")
    return size, overlap
def _collection():
    DB_PATH.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(DB_PATH))
    identity = re.sub(r"[^a-z0-9]+", "-", f"{embedding_mode()}-{embedding_model()}".lower()).strip("-")
    return client.get_or_create_collection(
        f"{COLLECTION_NAME}-{identity}"[:63], metadata={"hnsw:space": "cosine"}
    )


def _chunks(text: str, size: int | None = None, overlap: int | None = None) -> list[str]:
    configured_size, configured_overlap = chunk_settings()
    size = configured_size if size is None else size
    overlap = configured_overlap if overlap is None else overlap
    clean = re.sub(r"\s+", " ", text).strip()
    if not clean:
        return []
    chunks = []
    start = 0
    while start < len(clean):
        end = min(len(clean), start + size)
        if end < len(clean):
            boundary = clean.rfind("。", start + size // 2, end)
            if boundary < 0:
                boundary = clean.rfind(" ", start + size // 2, end)
            if boundary > start:
                end = boundary + 1
        chunks.append(clean[start:end])
        if end >= len(clean):
            break
        start = max(start + 1, end - overlap)
    return chunks


def ingest_pdf(reader: PdfReader, filename: str) -> tuple[str, int, int, str]:
    document_id = uuid.uuid4().hex
    documents: list[str] = []
    metadatas: list[dict[str, str | int]] = []
    ids: list[str] = []
    total_characters = 0

    for page_number, page in enumerate(reader.pages, start=1):
        page_text = (page.extract_text() or "").strip()
        total_characters += len(page_text)
        for chunk_number, chunk in enumerate(_chunks(page_text)):
            ids.append(f"{document_id}:{page_number}:{chunk_number}")
            documents.append(chunk)
            metadatas.append({"document_id": document_id, "filename": filename, "page": page_number})

    if not documents:
        raise ValueError("no extractable text")

    collection = _collection()
    collection.add(
        ids=ids,
        documents=documents,
        metadatas=metadatas,
        embeddings=embed_texts(documents),
    )
    return document_id, len(documents), total_characters, documents[0][:10_000]


def retrieve(document_id: str, query: str, limit: int | None = None) -> list[dict[str, str | int | float]]:
    result_limit = _positive_int("TOP_K", DEFAULT_TOP_K) if limit is None else limit
    results = _collection().query(
        query_embeddings=embed_texts([query], is_query=True),
        n_results=result_limit,
        where={"document_id": document_id},
        include=["documents", "metadatas", "distances"],
    )
    documents = results["documents"][0]
    metadatas = results["metadatas"][0]
    distances = results["distances"][0]
    hits = [
        {
            "text": document,
            "page": int(metadata["page"]),
            "filename": str(metadata["filename"]),
            "relevance": round(max(0.0, 1.0 - float(distance)), 3),
        }
        for document, metadata, distance in zip(documents, metadatas, distances)
    ]
    logger.info("RAG 检索命中 %d 个片段", len(hits))
    for index, hit in enumerate(hits, start=1):
        logger.info(
            "RAG 命中 #%d：页码=%s，相关度=%.3f",
            index,
            hit["page"],
            hit["relevance"],
        )
    return hits
