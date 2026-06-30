from __future__ import annotations

import re
from typing import Any

from .ocr_core import OcrLine, box_to_dict, union_boxes

QUESTION_ANCHOR_RE = re.compile(
    r"^\s*(?P<label>(?:\d{1,3})|(?:[（(]\d{1,3}[)）])|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]|(?:[一二三四五六七八九十]{1,3}))\s*[.)、．。]?\s*(?P<body>.+?)\s*$"
)
OPTION_RE = re.compile(r"^\s*([A-Ha-h])\s*[.)、．。]?\s*(.+?)\s*$")
ANSWER_RE = re.compile(r"^\s*(?:答案|参考答案|正确答案|答)\s*[:：]?\s*(.+?)\s*$", re.I)
QUESTION_SECTION_RE = re.compile(r"(?:[一二三四五六七八九十]+[、．。]\s*)?(?:单选|选择|判断|填空|简答|编程|程序|阅读).*题|本大题|每小题|共\s*\d+\s*分")
INSTRUCTION_RE = re.compile(r"注意事项|考试提交|提交文件|文件夹|命名为|考生文件|评分标准|题号|得分|流水评卷人|审核人")
PAGE_FOOTER_RE = re.compile(r"第\s*\d+\s*页|共\s*\d+\s*页")
BLANK_RE = re.compile(r"_{2,}|\(\s*\)|（\s*）")


def build_question_candidates(
    lines: list[OcrLine],
    page_number: int,
    asset_id: str,
    width: int,
    height: int,
    engine: str,
) -> list[dict[str, Any]]:
    content_lines = [line for line in sorted(lines, key=lambda item: (item.box.y, item.box.x)) if is_content_line(line)]
    if not content_lines:
        return []

    section_index = first_question_section_index(content_lines)
    scan_start = section_index + 1 if section_index >= 0 else 0
    anchors = [
        index
        for index in range(scan_start, len(content_lines))
        if is_question_anchor(content_lines[index].text)
    ]

    if not anchors:
        return []

    candidates: list[dict[str, Any]] = []
    for ordinal, start in enumerate(anchors, start=1):
        end = anchors[ordinal] if ordinal < len(anchors) else len(content_lines)
        block = content_lines[start:end]
        if not block:
            continue
        candidate = candidate_from_lines(block, page_number, ordinal, asset_id, width, height, engine)
        if candidate:
            candidates.append(candidate)
    return candidates


def candidate_from_lines(
    lines: list[OcrLine],
    page_number: int,
    ordinal: int,
    asset_id: str,
    width: int,
    height: int,
    engine: str,
) -> dict[str, Any] | None:
    raw_lines = [line.text.strip() for line in lines if line.text.strip()]
    if not raw_lines:
        return None

    raw_text = "\n".join(raw_lines)
    first_line = raw_lines[0]
    stem = strip_question_anchor(first_line)
    options = parse_candidate_options(raw_lines[1:])
    answer = parse_candidate_answer(raw_lines)
    question_type = infer_candidate_type(stem, options, answer)
    confidence = candidate_confidence(lines, options, answer)
    ignored = is_instruction_candidate(raw_text)
    warnings = candidate_warnings(question_type, options, answer, confidence)
    review_state = "ignored" if ignored else ("needs_review" if warnings else "confirmed")

    return {
        "id": f"p{page_number}_q{ordinal}",
        "pageNumber": page_number,
        "type": question_type,
        "stem": stem,
        "options": options,
        "answer": answer,
        "raw": raw_text,
        "confidence": confidence,
        "warnings": warnings,
        "ignored": ignored,
        "reviewState": review_state,
        "visual": {
            "source": "ocr",
            "assetId": asset_id,
            "pageNumber": page_number,
            "pageWidth": width,
            "pageHeight": height,
            "box": box_to_dict(union_boxes([line.box for line in lines])),
            "lineIds": [line.id for line in lines],
            "confidence": confidence,
            "engine": engine,
        },
        "engine": engine,
    }


def page_review_state(candidates: list[dict[str, Any]], engine: str, error: str) -> str:
    if error or engine == "failed":
        return "needs_review"
    active = [candidate for candidate in candidates if not candidate["ignored"]]
    if not active:
        return "ignored"
    if any(candidate["reviewState"] == "needs_review" for candidate in active):
        return "needs_review"
    return "confirmed"


def first_question_section_index(lines: list[OcrLine]) -> int:
    for index, line in enumerate(lines):
        text = line.text.strip()
        if QUESTION_SECTION_RE.search(text) and not looks_like_score_table_line(text):
            return index
    return -1


def is_content_line(line: OcrLine) -> bool:
    text = line.text.strip()
    if not text:
        return False
    if line.box.y < 0.035 or line.box.y > 0.965:
        return False
    if PAGE_FOOTER_RE.search(text):
        return False
    return True


def is_question_anchor(text: str) -> bool:
    clean = text.strip()
    match = QUESTION_ANCHOR_RE.match(clean)
    if not match:
        return False
    body = (match.group("body") or "").strip()
    if len(body) < 2:
        return False
    if looks_like_score_table_line(clean):
        return False
    if re.match(r"^[一二三四五六七八九十]+[、．。]\s*(?:单选|选择|判断|填空|简答|编程|程序|阅读).*题", clean):
        return False
    return True


def looks_like_score_table_line(text: str) -> bool:
    return bool(re.search(r"题号|得分|总分|评卷人|审核人|流水", text))


def is_instruction_candidate(text: str) -> bool:
    compact = re.sub(r"\s+", "", text)
    if INSTRUCTION_RE.search(compact):
        return True
    if len(compact) < 12 and not re.search(r"[?？]|_{2,}|（\s*）|\(\s*\)", compact):
        return True
    return False


def strip_question_anchor(text: str) -> str:
    match = QUESTION_ANCHOR_RE.match(text.strip())
    return (match.group("body") if match else text).strip()


def parse_candidate_options(lines: list[str]) -> list[dict[str, str]]:
    options: list[dict[str, str]] = []
    for line in lines:
        if ANSWER_RE.match(line):
            continue
        match = OPTION_RE.match(line)
        if match:
            options.append({"label": match.group(1).upper(), "text": match.group(2).strip()})
    if len(options) >= 2:
        return options

    joined = "\n".join(lines)
    compact_matches = list(re.finditer(r"([A-Ha-h])\s*[.)、．。]?\s*([\s\S]*?)(?=(?:[A-Ha-h]\s*[.)、．。])|$)", joined))
    compact_options = [
        {"label": match.group(1).upper(), "text": match.group(2).strip()}
        for match in compact_matches
        if match.group(2).strip()
    ]
    return compact_options if len(compact_options) >= 2 else options


def parse_candidate_answer(lines: list[str]) -> str:
    answers: list[str] = []
    for line in lines:
        match = ANSWER_RE.match(line)
        if match:
            answers.append(match.group(1).strip())
    return "\n".join(answers).strip()


def infer_candidate_type(stem: str, options: list[dict[str, str]], answer: str) -> str:
    answer_token = re.sub(r"\s+", "", answer).upper()
    if len(options) >= 2:
        return "choice"
    if answer_token in {"T", "F", "TRUE", "FALSE", "对", "错", "正确", "错误", "√", "×"}:
        return "true_false"
    if BLANK_RE.search(stem):
        return "blank"
    return "short"


def candidate_confidence(lines: list[OcrLine], options: list[dict[str, str]], answer: str) -> float:
    average = sum(line.confidence for line in lines) / max(1, len(lines))
    score = average
    if len(options) >= 2:
        score += 0.04
    if answer:
        score += 0.06
    return round(min(0.99, max(0.35, score)), 2)


def candidate_warnings(question_type: str, options: list[dict[str, str]], answer: str, confidence: float) -> list[str]:
    warnings: list[str] = []
    if confidence < 0.65:
        warnings.append("低置信度")
    if not answer:
        warnings.append("未识别到标准答案")
    if question_type == "choice" and len(options) < 2:
        warnings.append("选择题选项不足")
    return warnings
