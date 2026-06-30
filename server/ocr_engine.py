from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from .ocr_core import OcrLine, normalize_box


class OcrEngineManager:
    def __init__(self) -> None:
        self._engine: OcrEngine | None = None
        self._engine_error = ""

    @property
    def engine_loaded(self) -> bool:
        return self._engine is not None

    @property
    def engine_error(self) -> str:
        return self._engine_error

    def get(self) -> "OcrEngine":
        if self._engine is None:
            try:
                self._engine = OcrEngine()
                self._engine_error = ""
            except HTTPException as error:
                self._engine_error = str(error.detail)
                raise
        return self._engine


class OcrEngine:
    def __init__(self) -> None:
        self.backend = "none"
        self.instance: Any = None
        self.device = "gpu:0"
        self.load_errors: list[str] = []
        preferred = os.environ.get("REVIEW_OCR_ENGINE", "rapidocr").lower()
        if preferred == "paddle":
            self._load_paddle(device="gpu:0")
            return

        try:
            self._load_rapidocr()
        except HTTPException:
            self._load_paddle(device="gpu:0")

    def recognize(self, image_path: Path, width: int, height: int, page_number: int) -> list[OcrLine]:
        try:
            raw_result = self._predict(image_path)
        except Exception as error:
            raise HTTPException(status_code=500, detail=f"OCR failed: {error}") from error

        parsed = parse_ocr_result(raw_result, width, height)
        return [
            OcrLine(
                id=f"p{page_number}_l{index + 1}",
                text=item["text"],
                confidence=item["confidence"],
                box=item["box"],
            )
            for index, item in enumerate(parsed)
        ]

    def _load_paddle(self, device: str) -> None:
        try:
            from paddleocr import PaddleOCR  # type: ignore

            try:
                self.instance = PaddleOCR(
                    text_detection_model_name=os.environ.get("REVIEW_OCR_DET_MODEL", "PP-OCRv5_mobile_det"),
                    text_recognition_model_name=os.environ.get("REVIEW_OCR_REC_MODEL", "PP-OCRv5_mobile_rec"),
                    use_doc_orientation_classify=False,
                    use_doc_unwarping=False,
                    use_textline_orientation=False,
                    device=device,
                )
            except TypeError:
                self.instance = PaddleOCR(use_angle_cls=False, lang="ch")
            self.backend = "paddle"
            self.device = device
        except Exception as error:
            self.load_errors.append(f"PaddleOCR {device}: {error}")
            if device != "cpu":
                self._load_paddle(device="cpu")
                return
            self._load_rapidocr()

    def _load_rapidocr(self) -> None:
        try:
            from rapidocr import RapidOCR  # type: ignore

            self.instance = RapidOCR()
            self.backend = "rapidocr"
            self.device = "cpu"
        except Exception as error:
            self.load_errors.append(f"RapidOCR: {error}")
            details = " | ".join(self.load_errors[-3:])
            raise HTTPException(
                status_code=503,
                detail=(
                    "OCR 引擎未能初始化。请先运行 scripts\\setup-ocr.ps1，或检查 D:\\pyPrj\\review-slide-tool-upload\\.models。"
                    f" 详细错误：{details}"
                ),
            ) from error

    def _predict(self, image_path: Path) -> Any:
        if self.backend == "rapidocr":
            return self.instance(str(image_path))
        if hasattr(self.instance, "predict"):
            return self.instance.predict(str(image_path))
        return self.instance.ocr(str(image_path), cls=False)


def parse_ocr_result(raw_result: Any, width: int, height: int) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    json_result = to_json_result(raw_result)
    if isinstance(json_result, list):
        raw_result = json_result

    parallel_items = parse_parallel_ocr_fields(raw_result, width, height)
    if parallel_items:
        return parallel_items

    if isinstance(raw_result, tuple) and len(raw_result) >= 1:
        raw_result = raw_result[0]
    if isinstance(raw_result, list) and len(raw_result) == 1 and isinstance(raw_result[0], list):
        raw_result = raw_result[0]

    for page_result in as_list(raw_result):
        result_dict = getattr(page_result, "res", None)
        if isinstance(result_dict, dict):
            texts = dict_first(result_dict, ("rec_texts", "texts"), [])
            scores = dict_first(result_dict, ("rec_scores", "scores"), [])
            boxes = dict_first(result_dict, ("dt_polys", "rec_polys", "boxes"), [])
            for index, text in enumerate(texts):
                score = float(scores[index]) if index < len(scores) else 0
                box = normalize_box(to_plain_points(boxes[index]), width, height) if index < len(boxes) else normalize_box([], width, height)
                items.append({"text": str(text).strip(), "confidence": score, "box": box})
            continue

        if isinstance(page_result, dict):
            text = str(dict_first(page_result, ("text", "txt", "rec_text"), "")).strip()
            score = float(dict_first(page_result, ("confidence", "score", "rec_score"), 0))
            box_points = dict_first(page_result, ("box", "points", "dt_poly"), [])
            if text:
                items.append({"text": text, "confidence": score, "box": normalize_box(to_plain_points(box_points), width, height)})
            continue

        if is_legacy_paddle_line(page_result):
            text = str(page_result[1][0]).strip()
            score = float(page_result[1][1])
            items.append({"text": text, "confidence": score, "box": normalize_box(to_plain_points(page_result[0]), width, height)})
            continue

        if is_rapidocr_line(page_result):
            text = str(page_result[1]).strip()
            score = float(page_result[2])
            items.append({"text": text, "confidence": score, "box": normalize_box(to_plain_points(page_result[0]), width, height)})

    return [item for item in items if item["text"]]


def parse_parallel_ocr_fields(value: Any, width: int, height: int) -> list[dict[str, Any]]:
    texts = getattr(value, "txts", None)
    if texts is None:
        texts = getattr(value, "texts", None)
    scores = getattr(value, "scores", None)
    boxes = getattr(value, "boxes", None)
    if boxes is None:
        boxes = getattr(value, "dt_boxes", None)
    if texts is None or boxes is None:
        return []

    text_items = list(texts)
    score_items = list(scores) if scores is not None else []
    box_items = boxes.tolist() if hasattr(boxes, "tolist") else list(boxes)
    items: list[dict[str, Any]] = []
    for index, text in enumerate(text_items):
        clean_text = str(text).strip()
        if not clean_text:
            continue
        score = float(score_items[index]) if index < len(score_items) else 0
        box = box_items[index] if index < len(box_items) else []
        items.append({"text": clean_text, "confidence": score, "box": normalize_box(to_plain_points(box), width, height)})
    return items


def to_json_result(value: Any) -> Any:
    to_json = getattr(value, "to_json", None)
    if not callable(to_json):
        return None
    try:
        return to_json()
    except TypeError:
        return None


def to_plain_points(value: Any) -> Any:
    if hasattr(value, "tolist"):
        return value.tolist()
    return value


def dict_first(source: dict[str, Any], keys: tuple[str, ...], fallback: Any) -> Any:
    for key in keys:
        value = source.get(key)
        if value is not None:
            return value
    return fallback


def as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def is_legacy_paddle_line(value: Any) -> bool:
    return (
        isinstance(value, list)
        and len(value) >= 2
        and isinstance(value[1], (tuple, list))
        and len(value[1]) >= 2
    )


def is_rapidocr_line(value: Any) -> bool:
    return isinstance(value, (tuple, list)) and len(value) >= 3 and isinstance(value[1], str)
