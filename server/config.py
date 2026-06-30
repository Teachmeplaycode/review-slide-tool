from __future__ import annotations

import os

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
PDF_EXTENSIONS = {".pdf"}
PPT_EXTENSIONS = {".ppt", ".pptx"}

PDF_RENDER_SCALE = float(os.environ.get("REVIEW_OCR_PDF_SCALE", "1.6"))
OCR_WORKERS = max(1, int(os.environ.get("REVIEW_OCR_WORKERS", "1")))

CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]
