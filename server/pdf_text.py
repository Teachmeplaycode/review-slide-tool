from __future__ import annotations

from typing import Any

from .ocr_core import OcrLine, normalize_box

MIN_TEXT_LAYER_CHARS = 80


def extract_pdf_text_lines(page: Any, page_number: int) -> list[OcrLine]:
    try:
        payload = page.get_text("dict")
    except Exception:
        return []

    page_width = float(page.rect.width)
    page_height = float(page.rect.height)
    items: list[tuple[float, float, OcrLine]] = []
    line_index = 1

    for block in payload.get("blocks", []):
        if block.get("type") != 0:
            continue
        for text_line in block.get("lines", []):
            spans = text_line.get("spans", [])
            text = "".join(str(span.get("text", "")) for span in spans).strip()
            if not text:
                continue
            bbox = text_line.get("bbox") or block.get("bbox") or [0, 0, page_width, page_height]
            points = [
                [bbox[0], bbox[1]],
                [bbox[2], bbox[1]],
                [bbox[2], bbox[3]],
                [bbox[0], bbox[3]],
            ]
            box = normalize_box(points, int(page_width), int(page_height))
            items.append((
                box.y,
                box.x,
                OcrLine(
                    id=f"p{page_number}_l{line_index}",
                    text=text,
                    confidence=1.0,
                    box=box,
                ),
            ))
            line_index += 1

    return [line for _, _, line in sorted(items, key=lambda item: (item[0], item[1]))]


def is_good_text_layer(lines: list[OcrLine]) -> bool:
    text = "\n".join(line.text for line in lines)
    if len(text) < MIN_TEXT_LAYER_CHARS:
        return False
    replacement_count = text.count("\ufffd") + text.count("?")
    meaningful_count = sum(1 for char in text if char.isalnum() or "\u4e00" <= char <= "\u9fff")
    if meaningful_count < MIN_TEXT_LAYER_CHARS * 0.45:
        return False
    if replacement_count / max(1, len(text)) > 0.08:
        return False
    return True
