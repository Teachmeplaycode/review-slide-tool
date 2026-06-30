from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from fastapi.responses import FileResponse

from .ocr_core import WEB_OCR_MODEL_ROOT


def browser_ocr_manifest_payload() -> dict[str, Any]:
    required = {
        "det": WEB_OCR_MODEL_ROOT / "PP-OCRv6_det_small.onnx",
        "cls": WEB_OCR_MODEL_ROOT / "ch_ppocr_mobile_v2.0_cls_mobile.onnx",
        "rec": WEB_OCR_MODEL_ROOT / "PP-OCRv6_rec_small.onnx",
    }
    files = {
        key: {
            "url": f"/api/ocr/browser/models/{path.name}",
            "present": path.exists(),
            "size": path.stat().st_size if path.exists() else 0,
        }
        for key, path in required.items()
    }
    return {
        "ready": all(item["present"] for item in files.values()),
        "modelRoot": str(WEB_OCR_MODEL_ROOT),
        "runtime": "onnxruntime-web",
        "files": files,
    }


def browser_ocr_model_response(filename: str) -> FileResponse:
    if "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid model filename.")
    path = (WEB_OCR_MODEL_ROOT / filename).resolve()
    if path.parent != WEB_OCR_MODEL_ROOT.resolve() or not path.exists():
        raise HTTPException(status_code=404, detail="Browser OCR model not found.")
    return FileResponse(path, media_type="application/octet-stream")
