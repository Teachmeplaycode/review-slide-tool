from __future__ import annotations

import shutil
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile

from .config import IMAGE_EXTENSIONS, OCR_WORKERS, PDF_EXTENSIONS, PPT_EXTENSIONS
from .ocr_core import OcrLine, TEMP_ROOT, ensure_not_c_drive
from .ocr_engine import OcrEngineManager
from .payloads import page_payload, text_from_pages
from .pdf_text import extract_pdf_text_lines, is_good_text_layer
from .rendering import asset_payload, image_payload, render_pdf_page


class OcrJobService:
    def __init__(self, engine_manager: OcrEngineManager) -> None:
        self.engine_manager = engine_manager
        self.jobs: dict[str, dict[str, Any]] = {}
        self.lock = threading.Lock()
        self.executor = ThreadPoolExecutor(max_workers=OCR_WORKERS)

    async def import_file(self, file: UploadFile) -> dict[str, Any]:
        extension = Path(file.filename or "").suffix.lower()
        if extension in PPT_EXTENSIONS:
            raise HTTPException(status_code=415, detail="PPT/PPTX 第一版暂缓支持，请先导出为 PDF 后再导入。")
        if extension not in PDF_EXTENSIONS and extension not in IMAGE_EXTENSIONS:
            raise HTTPException(status_code=415, detail="OCR v1 支持 PDF 和图片文件。")

        request_dir = ensure_not_c_drive(TEMP_ROOT / uuid.uuid4().hex)
        request_dir.mkdir(parents=True, exist_ok=True)
        source_path = request_dir / f"source{extension or '.bin'}"
        with source_path.open("wb") as handle:
            shutil.copyfileobj(file.file, handle)

        if extension in PDF_EXTENSIONS:
            return self.create_progressive_pdf_job(source_path, request_dir, file.filename or "OCR Import")

        try:
            return self.process_image_file(source_path, file.filename or "OCR Import")
        finally:
            shutil.rmtree(request_dir, ignore_errors=True)

    def get_payload(self, job_id: str, after_page: int = 0) -> dict[str, Any]:
        with self.lock:
            job = self.jobs.get(job_id)
            if not job:
                raise HTTPException(status_code=404, detail="OCR job not found.")
            return self.job_payload(job, after_page=after_page)

    def create_progressive_pdf_job(self, source_path: Path, job_dir: Path, filename: str) -> dict[str, Any]:
        try:
            import fitz  # type: ignore
        except Exception as error:
            raise HTTPException(status_code=503, detail="PyMuPDF is required for PDF OCR. Install server requirements.") from error

        job_id = uuid.uuid4().hex
        document = fitz.open(source_path)
        total_pages = document.page_count
        if total_pages <= 0:
            document.close()
            raise HTTPException(status_code=422, detail="PDF has no pages.")

        first_rendered = render_pdf_page(document, 1, job_dir)
        document.close()

        job: dict[str, Any] = {
            "id": job_id,
            "title": without_extension(filename),
            "sourceFile": filename,
            "sourceKind": "pdf",
            "status": "processing",
            "processedPages": 0,
            "totalPages": total_pages,
            "error": "",
            "pages": {},
            "assets": {},
            "sourcePath": str(source_path),
            "jobDir": str(job_dir),
        }
        self.upsert_rendered_page(job, first_rendered, lines=[], engine="pending")

        with self.lock:
            self.jobs[job_id] = job

        self.executor.submit(self.process_pdf_job, job_id)
        return self.job_payload(job)

    def process_pdf_job(self, job_id: str) -> None:
        with self.lock:
            job = self.jobs.get(job_id)
            if not job:
                return
            source_path = Path(job["sourcePath"])
            job_dir = Path(job["jobDir"])
            total_pages = int(job["totalPages"])

        try:
            try:
                import fitz  # type: ignore
            except Exception as error:
                raise RuntimeError("PyMuPDF is required for PDF OCR. Install server requirements.") from error

            document = fitz.open(source_path)
            for page_number in range(1, total_pages + 1):
                rendered = render_pdf_page(document, page_number, job_dir)
                lines, engine_name, page_error = self.recognize_pdf_page(document[page_number - 1], rendered, page_number)

                with self.lock:
                    current = self.jobs.get(job_id)
                    if not current:
                        return
                    self.upsert_rendered_page(current, rendered, lines, engine=engine_name, error=page_error)
                    current["processedPages"] = page_number

            document.close()
            with self.lock:
                if job_id in self.jobs:
                    self.jobs[job_id]["status"] = "complete"
        except Exception as error:
            with self.lock:
                if job_id in self.jobs:
                    self.jobs[job_id]["status"] = "failed"
                    self.jobs[job_id]["error"] = str(getattr(error, "detail", error))
        finally:
            shutil.rmtree(job_dir, ignore_errors=True)

    def process_image_file(self, source_path: Path, filename: str) -> dict[str, Any]:
        rendered = image_payload(source_path, 1)
        asset = asset_payload(rendered, f"asset_{uuid.uuid4().hex}")
        page = page_payload(rendered, asset["id"], [], engine="manual")
        page["pageReviewState"] = "confirmed"
        page["candidateCount"] = 1

        return {
            "title": without_extension(filename),
            "sourceFile": filename,
            "text": "",
            "ocr": {
                "mode": "auto",
                "sourceKind": "image",
                "status": "complete",
                "processedPages": 1,
                "totalPages": 1,
                "pages": [page],
                "assets": [asset],
            },
        }

    def recognize_pdf_page(self, page: Any, rendered: dict[str, Any], page_number: int) -> tuple[list[OcrLine], str, str]:
        text_lines = extract_pdf_text_lines(page, page_number)
        if is_good_text_layer(text_lines):
            return text_lines, "pdf_text", ""

        try:
            engine = self.engine_manager.get()
            return engine.recognize(rendered["path"], rendered["width"], rendered["height"], page_number), engine.backend, ""
        except Exception as error:
            if text_lines:
                return text_lines, "pdf_text_low_quality", str(getattr(error, "detail", error))
            return [], "failed", str(getattr(error, "detail", error))

    def upsert_rendered_page(self, job: dict[str, Any], rendered: dict[str, Any], lines: list[OcrLine], engine: str, error: str = "") -> None:
        asset = asset_payload(rendered, f"asset_{job['id']}_p{rendered['pageNumber']}")
        page = page_payload(rendered, asset["id"], lines, engine=engine, error=error)
        job["assets"][asset["id"]] = asset
        job["pages"][rendered["pageNumber"]] = page

    def job_payload(self, job: dict[str, Any], after_page: int = 0) -> dict[str, Any]:
        all_pages = [job["pages"][key] for key in sorted(job["pages"])]
        pages = [page for page in all_pages if int(page["pageNumber"]) > after_page]
        asset_ids = {str(page["assetId"]) for page in pages}
        assets = [job["assets"][key] for key in sorted(job["assets"]) if key in asset_ids]

        return {
            "title": job["title"],
            "sourceFile": job["sourceFile"],
            "text": text_from_pages(all_pages),
            "ocr": {
                "mode": "auto",
                "sourceKind": job["sourceKind"],
                "jobId": job["id"],
                "status": job["status"],
                "processedPages": job["processedPages"],
                "totalPages": job["totalPages"],
                "error": job["error"],
                "pages": pages,
                "assets": assets,
            },
        }


def without_extension(name: str) -> str:
    return Path(name).stem or name
