from pathlib import Path

from server.ocr_core import MODEL_ROOT, OcrBox, OcrLine, OcrPage, build_ocr_text, ensure_not_c_drive, normalize_box, union_boxes


def test_normalizes_polygon_to_page_relative_box():
    box = normalize_box([[10, 20], [110, 20], [110, 70], [10, 70]], 200, 100)

    assert box.x == 0.05
    assert box.y == 0.2
    assert box.width == 0.5
    assert box.height == 0.5


def test_build_text_filters_low_confidence_lines():
    page = OcrPage(
        page_number=1,
        asset_id="asset_1",
        width=100,
        height=100,
        lines=(
            OcrLine("l1", "第一题", 0.92, OcrBox(0, 0, 0.5, 0.1)),
            OcrLine("l2", "噪声", 0.12, OcrBox(0, 0.2, 0.5, 0.1)),
        ),
    )

    assert build_ocr_text([page]) == "第一题"


def test_union_boxes_adds_padding_and_stays_on_page():
    box = union_boxes([OcrBox(0.02, 0.02, 0.2, 0.2), OcrBox(0.8, 0.8, 0.19, 0.19)])

    assert box.x == 0.008
    assert box.y == 0.008
    assert box.width == 0.992
    assert box.height == 0.992


def test_model_path_is_not_on_c_drive():
    assert not ensure_not_c_drive(Path(MODEL_ROOT)).drive.upper().startswith("C:")
