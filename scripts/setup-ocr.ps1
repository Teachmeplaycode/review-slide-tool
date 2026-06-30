param(
  [string]$EnvPath = "D:\conda_envs\review_ocr",
  [string]$Python = "D:\Programs\Python\Python312\python.exe"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$CacheRoot = Join-Path $ProjectRoot ".runtime\pip-cache"
$ModelRoot = Join-Path $ProjectRoot ".models\paddleocr"
$WebModelRoot = Join-Path $ProjectRoot ".models\web-ocr"

New-Item -ItemType Directory -Force -Path $EnvPath, $CacheRoot, $ModelRoot, $WebModelRoot | Out-Null

$env:PIP_CACHE_DIR = $CacheRoot
$env:PADDLE_HOME = $ModelRoot
$env:PADDLEOCR_HOME = $ModelRoot
$env:PADDLE_PDX_CACHE_HOME = Join-Path $ModelRoot "paddlex"
$env:PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK = "True"
$env:PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION = "python"

if (-not (Test-Path -LiteralPath (Join-Path $EnvPath "python.exe"))) {
  & $Python -m venv $EnvPath
}

$VenvPython = Join-Path $EnvPath "python.exe"
& $VenvPython -m pip install --upgrade pip --cache-dir $CacheRoot
& $VenvPython -m pip install -r (Join-Path $ProjectRoot "server\requirements.txt") --cache-dir $CacheRoot
& $VenvPython -m pip install "protobuf<3.21" --cache-dir $CacheRoot

$RapidModelDir = & $VenvPython -c "from pathlib import Path; import rapidocr; print(Path(rapidocr.__file__).resolve().parent / 'models')"
$WebModelFiles = @(
  "PP-OCRv6_det_small.onnx",
  "ch_ppocr_mobile_v2.0_cls_mobile.onnx",
  "PP-OCRv6_rec_small.onnx"
)

foreach ($ModelFile in $WebModelFiles) {
  $Source = Join-Path $RapidModelDir $ModelFile
  if (Test-Path -LiteralPath $Source) {
    Copy-Item -LiteralPath $Source -Destination (Join-Path $WebModelRoot $ModelFile) -Force
  }
}

Write-Host "OCR environment ready at $EnvPath"
Write-Host "Model/cache root: $ModelRoot"
Write-Host "Browser OCR model root: $WebModelRoot"
