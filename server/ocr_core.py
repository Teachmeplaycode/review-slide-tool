from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence


PROJECT_ROOT = Path(__file__).resolve().parents[1]
D_DRIVE_ROOT = PROJECT_ROOT if PROJECT_ROOT.drive.upper().startswith("D:") else Path("D:/pyPrj/review-slide-tool-upload")
MODEL_ROOT = D_DRIVE_ROOT / ".models" / "paddleocr"
WEB_OCR_MODEL_ROOT = D_DRIVE_ROOT / ".models" / "web-ocr"
RUNTIME_ROOT = D_DRIVE_ROOT / ".runtime"
TEMP_ROOT = RUNTIME_ROOT / "ocr-tmp"


@dataclass(frozen=True)
class OcrBox:
    x: float
    y: float
    width: float
    height: float


@dataclass(frozen=True)
class OcrLine:
    id: str
    text: str
    confidence: float
    box: OcrBox


@dataclass(frozen=True)
class OcrPage:
    page_number: int
    asset_id: str
    width: int
    height: int
    lines: tuple[OcrLine, ...]


def configure_d_drive_runtime() -> None:
    """Keep model and runtime caches on D drive before OCR libraries import."""

    MODEL_ROOT.mkdir(parents=True, exist_ok=True)
    WEB_OCR_MODEL_ROOT.mkdir(parents=True, exist_ok=True)
    TEMP_ROOT.mkdir(parents=True, exist_ok=True)

    cache_root = RUNTIME_ROOT / "cache"
    cache_root.mkdir(parents=True, exist_ok=True)

    os.environ.setdefault("PADDLE_HOME", str(MODEL_ROOT))
    os.environ.setdefault("PADDLEOCR_HOME", str(MODEL_ROOT))
    os.environ.setdefault("PADDLE_PDX_CACHE_HOME", str(MODEL_ROOT / "paddlex"))
    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
    os.environ.setdefault("PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION", "python")
    os.environ.setdefault("XDG_CACHE_HOME", str(cache_root))
    os.environ.setdefault("HF_HOME", str(cache_root / "huggingface"))
    os.environ.setdefault("MODELSCOPE_CACHE", str(cache_root / "modelscope"))
    os.environ.setdefault("TMP", str(TEMP_ROOT))
    os.environ.setdefault("TEMP", str(TEMP_ROOT))


def normalize_box(points: Sequence[Sequence[float]], width: int, height: int) -> OcrBox:
    if width <= 0 or height <= 0:
        raise ValueError("Page width and height must be positive")
    if not points:
        return OcrBox(0, 0, 1, 1)

    xs = [float(point[0]) for point in points if len(point) >= 2]
    ys = [float(point[1]) for point in points if len(point) >= 2]
    if not xs or not ys:
        return OcrBox(0, 0, 1, 1)

    left = clamp(min(xs) / width)
    top = clamp(min(ys) / height)
    right = clamp(max(xs) / width)
    bottom = clamp(max(ys) / height)
    return OcrBox(left, top, max(0.002, right - left), max(0.002, bottom - top))


def union_boxes(boxes: Iterable[OcrBox], padding: float = 0.012) -> OcrBox:
    items = list(boxes)
    if not items:
        return OcrBox(0, 0, 1, 1)

    left = max(0, min(box.x for box in items) - padding)
    top = max(0, min(box.y for box in items) - padding)
    right = min(1, max(box.x + box.width for box in items) + padding)
    bottom = min(1, max(box.y + box.height for box in items) + padding)
    return OcrBox(left, top, max(0.002, right - left), max(0.002, bottom - top))


def filter_lines(lines: Iterable[OcrLine], min_confidence: float = 0.35) -> tuple[OcrLine, ...]:
    return tuple(line for line in lines if line.text.strip() and line.confidence >= min_confidence)


def build_ocr_text(pages: Iterable[OcrPage], min_confidence: float = 0.35) -> str:
    page_texts: list[str] = []
    for page in pages:
        lines = filter_lines(page.lines, min_confidence)
        if lines:
            page_texts.append("\n".join(line.text for line in lines))
    return "\n\n".join(page_texts).strip()


def box_to_dict(box: OcrBox) -> dict[str, float]:
    return {
        "x": round(box.x, 6),
        "y": round(box.y, 6),
        "width": round(box.width, 6),
        "height": round(box.height, 6),
    }


def line_to_dict(line: OcrLine) -> dict[str, object]:
    return {
        "id": line.id,
        "text": line.text,
        "confidence": round(line.confidence, 4),
        "box": box_to_dict(line.box),
    }


def ensure_not_c_drive(path: Path) -> Path:
    resolved = path.resolve()
    if resolved.drive.upper().startswith("C:"):
        raise RuntimeError(f"Refusing to use C drive runtime path: {resolved}")
    return resolved


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return min(high, max(low, value))
