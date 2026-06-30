from __future__ import annotations

import base64
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from .config import PDF_RENDER_SCALE


def render_pdf_page(document: Any, page_number: int, request_dir: Path) -> dict[str, Any]:
    page = document[page_number - 1]
    import fitz  # type: ignore

    pixmap = page.get_pixmap(matrix=fitz.Matrix(PDF_RENDER_SCALE, PDF_RENDER_SCALE), alpha=False)
    path = request_dir / f"page_{page_number}.png"
    pixmap.save(path)
    return {"pageNumber": page_number, "path": path, "width": pixmap.width, "height": pixmap.height}


def image_payload(source_path: Path, page_number: int) -> dict[str, Any]:
    try:
        from PIL import Image  # type: ignore
    except Exception as error:
        raise HTTPException(status_code=503, detail="Pillow is required for image OCR. Install server requirements.") from error

    with Image.open(source_path) as image:
        width, height = image.size
        if image.format != "PNG":
            png_path = source_path.with_suffix(".png")
            image.convert("RGB").save(png_path)
            source_path = png_path
    return {"pageNumber": page_number, "path": source_path, "width": width, "height": height}


def asset_payload(rendered: dict[str, Any], asset_id: str) -> dict[str, object]:
    return {
        "id": asset_id,
        "mimeType": "image/png",
        "dataUrl": file_to_data_url(rendered["path"], "image/png"),
        "width": rendered["width"],
        "height": rendered["height"],
    }


def file_to_data_url(path: Path, mime_type: str) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"
