from io import BytesIO

from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel
from pypdf import PdfReader

from app.schemas import RewriteRequest, RewriteResponse
from app.services.llm import LLMConfigurationError, LLMServiceError, generate_support
from app.services.orchestrator import select_support_functions
from app.services.rag import ingest_pdf, retrieve


app = FastAPI(
    title="Learner-Controlled Scaffolding API",
    description="Generate task-grounded support from learner-controlled settings.",
    version="0.2.0",
)


class HealthResponse(BaseModel):
    status: str


class PdfExtractionResponse(BaseModel):
    filename: str
    page_count: int
    text: str
    character_count: int
    truncated: bool
    document_id: str
    chunk_count: int


@app.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    return HealthResponse(status="ok")


@app.post("/api/pdf/extract", response_model=PdfExtractionResponse)
async def extract_pdf(file: UploadFile = File(...)) -> PdfExtractionResponse:
    if file.content_type != "application/pdf" and not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="目前只支持 PDF 文件。")

    contents = await file.read()
    if len(contents) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="PDF 不能超过 15 MB。")

    try:
        reader = PdfReader(BytesIO(contents))
    except Exception as exc:
        raise HTTPException(status_code=422, detail="无法读取这个 PDF，请确认文件未损坏或加密。") from exc

    try:
        document_id, chunk_count, character_count, preview = ingest_pdf(
            reader, file.filename or "document.pdf"
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=f"Embedding 服务失败：{exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="这个 PDF 没有可提取的文字；扫描版 PDF 暂不支持。") from exc

    return PdfExtractionResponse(
        filename=file.filename or "document.pdf",
        page_count=len(reader.pages),
        text=preview,
        character_count=character_count,
        truncated=character_count > len(preview),
        document_id=document_id,
        chunk_count=chunk_count,
    )


@app.post("/api/rewrite", response_model=RewriteResponse)
async def rewrite(request: RewriteRequest) -> RewriteResponse:
    if not request.text.strip() and not request.document_id:
        raise HTTPException(status_code=422, detail="请粘贴技术材料或上传 PDF。")

    retrieved_sources = []
    source_text = request.text
    if request.document_id:
        query = (request.query or request.task_state.objective).strip()
        try:
            retrieved_sources = retrieve(request.document_id, query)
        except Exception as exc:
            raise HTTPException(status_code=404, detail="找不到已上传的 PDF，请重新上传。") from exc
        source_text = "\n\n".join(
            f"[来源：第 {source['page']} 页]\n{source['text']}" for source in retrieved_sources
        )
    selected_functions = select_support_functions(
        request.support_configuration,
        request.task_state,
    )

    try:
        support = await generate_support(
            text=source_text,
            support_configuration=request.support_configuration,
            task_state=request.task_state,
            selected_functions=selected_functions,
        )
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except LLMServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return RewriteResponse(
        original=source_text,
        support=support,
        support_configuration=request.support_configuration,
        selected_functions=selected_functions,
        retrieved_sources=retrieved_sources,
    )
