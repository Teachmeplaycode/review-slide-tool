param(
  [string]$BackendHost = "127.0.0.1",
  [int]$BackendPort = 8787,
  [int]$FrontendPort = 5173,
  [string]$Python = "D:\conda_envs\review_ocr\python.exe"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$FallbackPython = "D:\Programs\Python\Python312\python.exe"

if (-not (Test-Path -LiteralPath $Python)) {
  $Python = $FallbackPython
}

if (-not (Test-Path -LiteralPath $Python)) {
  throw "Python not found. Expected D:\conda_envs\review_ocr\python.exe or D:\Programs\Python\Python312\python.exe"
}

$env:PADDLE_HOME = Join-Path $ProjectRoot ".models\paddleocr"
$env:PADDLEOCR_HOME = $env:PADDLE_HOME
$env:PADDLE_PDX_CACHE_HOME = Join-Path $env:PADDLE_HOME "paddlex"
$env:PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK = "True"
$env:PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION = "python"
$env:XDG_CACHE_HOME = Join-Path $ProjectRoot ".runtime\cache"
$env:TMP = Join-Path $ProjectRoot ".runtime\ocr-tmp"
$env:TEMP = $env:TMP

New-Item -ItemType Directory -Force -Path $env:PADDLE_HOME, $env:PADDLE_PDX_CACHE_HOME, $env:XDG_CACHE_HOME, $env:TMP | Out-Null

$BackendArgs = @(
  "-m", "uvicorn",
  "server.main:app",
  "--host", $BackendHost,
  "--port", [string]$BackendPort,
  "--app-dir", $ProjectRoot
)

$Backend = Start-Process -FilePath $Python -ArgumentList $BackendArgs -WorkingDirectory $ProjectRoot -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2

if ($Backend.HasExited) {
  throw "OCR backend exited immediately. Run scripts\setup-ocr.ps1 first, then retry npm run dev:all."
}

try {
  Write-Host "OCR backend: http://$BackendHost`:$BackendPort"
  Write-Host "Frontend:    http://127.0.0.1:$FrontendPort"
  npm run dev -- --host 127.0.0.1 --port $FrontendPort
}
finally {
  if ($Backend -and -not $Backend.HasExited) {
    Stop-Process -Id $Backend.Id -Force
  }
}
