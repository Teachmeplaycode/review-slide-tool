from server.ocr_core import OcrBox, OcrLine
from server.question_candidates import build_question_candidates


def test_question_candidates_start_after_section_heading():
    lines = [
        OcrLine("l1", "考试提交文件：按学号姓名提交", 1, OcrBox(0.1, 0.1, 0.5, 0.03)),
        OcrLine("l2", "一、选择题（每小题 1 分）", 1, OcrBox(0.1, 0.2, 0.5, 0.03)),
        OcrLine("l3", "1. Python 中用于定义函数的关键字是（ ）。", 1, OcrBox(0.1, 0.25, 0.7, 0.03)),
        OcrLine("l4", "A. class", 1, OcrBox(0.12, 0.3, 0.2, 0.03)),
        OcrLine("l5", "B. def", 1, OcrBox(0.42, 0.3, 0.2, 0.03)),
    ]

    candidates = build_question_candidates(lines, 1, "asset_1", 1000, 1400, "pdf_text")

    assert len(candidates) == 1
    assert candidates[0]["stem"] == "Python 中用于定义函数的关键字是（ ）。"
    assert candidates[0]["options"] == [
        {"label": "A", "text": "class"},
        {"label": "B", "text": "def"},
    ]


def test_instruction_only_page_has_no_candidates():
    lines = [
        OcrLine("l1", "考试注意事项", 1, OcrBox(0.1, 0.1, 0.5, 0.03)),
        OcrLine("l2", "1. 将考生文件夹命名为学号姓名提交", 1, OcrBox(0.1, 0.2, 0.7, 0.03)),
    ]

    assert build_question_candidates(lines, 1, "asset_1", 1000, 1400, "pdf_text") == []
