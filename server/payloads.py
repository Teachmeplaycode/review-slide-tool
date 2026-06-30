from __future__ import annotations

from typing import Any

from .ocr_core import OcrLine, line_to_dict
from .question_candidates import build_question_candidates, page_review_state


def page_payload(rendered: dict[str, Any], asset_id: str, lines: list[OcrLine], engine: str, error: str = "") -> dict[str, Any]:
    page_number = int(rendered["pageNumber"])
    candidates = build_question_candidates(lines, page_number, asset_id, int(rendered["width"]), int(rendered["height"]), engine)
    active_candidates = [candidate for candidate in candidates if not candidate["ignored"]]
    page_state = page_review_state(candidates, engine, error)

    return {
        "pageNumber": page_number,
        "assetId": asset_id,
        "width": rendered["width"],
        "height": rendered["height"],
        "engine": engine,
        "pageReviewState": page_state,
        "candidateCount": len(active_candidates),
        "error": error,
        "lines": [line_to_dict(line) for line in lines],
        "candidates": candidates,
    }


def text_from_pages(pages: list[dict[str, Any]]) -> str:
    page_texts: list[str] = []
    for page in pages:
        lines = [
            str(line["text"]).strip()
            for line in page.get("lines", [])
            if str(line.get("text", "")).strip() and float(line.get("confidence", 0)) >= 0.35
        ]
        if lines:
            page_texts.append("\n".join(lines))
    return "\n\n".join(page_texts).strip()
