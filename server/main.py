from __future__ import annotations

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .browser_models import browser_ocr_manifest_payload, browser_ocr_model_response
from .config import CORS_ORIGINS
from .jobs import OcrJobService
from .ocr_core import TEMP_ROOT, configure_d_drive_runtime, ensure_not_c_drive
from .ocr_engine import OcrEngineManager


configure_d_drive_runtime()

engine_manager = OcrEngineManager()
ocr_jobs = OcrJobService(engine_manager)

app = FastAPI(title="Review Slide Tool OCR", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, object]:
    return {
        "ok": True,
        "runtimeRoot": str(ensure_not_c_drive(TEMP_ROOT)),
        "engineLoaded": engine_manager.engine_loaded,
        "engineError": engine_manager.engine_error,
    }


@app.post("/api/ocr/import")
async def import_ocr_file(file: UploadFile = File(...)) -> JSONResponse:
    return JSONResponse(await ocr_jobs.import_file(file))


@app.get("/api/ocr/jobs/{job_id}")
def get_ocr_job(job_id: str, after_page: int = Query(0, alias="afterPage", ge=0)) -> JSONResponse:
    return JSONResponse(ocr_jobs.get_payload(job_id, after_page=after_page))


@app.get("/api/ocr/browser/manifest")
def browser_ocr_manifest() -> dict[str, object]:
    return browser_ocr_manifest_payload()


@app.get("/api/ocr/browser/models/{filename}")
def browser_ocr_model(filename: str):
    return browser_ocr_model_response(filename)


@app.exception_handler(HTTPException)
async def http_exception_handler(_, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
