# OCR backend

This backend is a local FastAPI service for PDF/image OCR. PDF imports are progressive: the first rendered page is returned immediately, then each page is processed in a background job and appended to preview as it completes. Job polling supports `afterPage` so the frontend fetches only newly processed pages and page images.

PDF pages are processed in this order: text layer first, then RapidOCR, then PaddleOCR if forced or needed as a fallback. Each page returns OCR lines plus page-local question candidates, page review state, candidate count, and the engine used.

## Module layout

- `main.py`: FastAPI app setup, CORS, route declarations, and exception handling only.
- `jobs.py`: upload handling, progressive PDF job state, page polling payloads, and image import orchestration.
- `ocr_engine.py`: OCR engine loading, GPU/CPU fallback, and raw OCR result normalization.
- `pdf_text.py`: PDF text layer extraction and quality checks.
- `question_candidates.py`: page-local question block detection, option/answer inference, ignore/review state rules.
- `rendering.py`: PDF/image rendering and image asset data URL creation.
- `payloads.py`: converts rendered pages, OCR lines, and candidates into the frontend response contract.
- `browser_models.py`: local browser OCR model manifest and static model file responses.
- `ocr_core.py`: D-drive runtime configuration plus shared OCR dataclasses and geometry helpers.

## Setup

Run from the project root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-ocr.ps1
```

The setup script creates or reuses `D:\conda_envs\review_ocr`, keeps pip cache under the project `.runtime` folder on D drive, keeps OCR model cache under `.models\paddleocr`, and copies RapidOCR ONNX files into `.models\web-ocr` for browser-side fallback checks.

## Run

```powershell
npm run dev:all
```

The Vite app proxies `/api` to `http://127.0.0.1:8787`. PDF and image files use this backend automatically. PPT/PPTX is intentionally deferred in v1; export to PDF first.

By default the backend uses RapidOCR for faster local startup. Set `REVIEW_OCR_ENGINE=paddle` to force PaddleOCR. Paddle mode uses the faster PP-OCRv5 mobile models by default; override with `REVIEW_OCR_DET_MODEL` and `REVIEW_OCR_REC_MODEL` if you want the heavier server models.

Browser OCR fallback uses `onnxruntime-web` as a lazy-loaded client runtime. The backend exposes `/api/ocr/browser/manifest` and `/api/ocr/browser/models/{filename}` from `.models\web-ocr`; the frontend only adopts browser OCR results after user confirmation.
