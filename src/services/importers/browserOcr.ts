import type { OcrPage } from '../../types'

type BrowserOcrManifest = {
  ready: boolean
  modelRoot: string
  runtime: string
  files: Record<string, { url: string, present: boolean, size: number }>
}

type BrowserOcrAdapter = (page: OcrPage, assetUrl: string) => Promise<OcrPage>

let adapter: BrowserOcrAdapter | null = null

export function setBrowserOcrAdapter(next: BrowserOcrAdapter | null) {
  adapter = next
}

export async function rescanPageWithBrowserOcr(page: OcrPage, assetUrl: string): Promise<OcrPage> {
  if (adapter) return adapter(page, assetUrl)

  const manifest = await loadBrowserOcrManifest()
  if (!manifest.ready) {
    const missing = Object.entries(manifest.files)
      .filter(([, file]) => !file.present)
      .map(([key]) => key)
      .join('、')
    throw new Error(`浏览器 OCR 模型未就绪：缺少 ${missing || '模型文件'}。请将 ONNX 模型放到 ${manifest.modelRoot}`)
  }

  const ort = await import('onnxruntime-web')
  ort.env.wasm.numThreads = Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1))
  await Promise.all(Object.values(manifest.files).map((file) => ort.InferenceSession.create(file.url)))
  throw new Error('浏览器 ONNX 运行时已就绪，但 PP-OCR 检测/识别后处理尚未配置完成。')
}

async function loadBrowserOcrManifest(): Promise<BrowserOcrManifest> {
  const response = await fetch('/api/ocr/browser/manifest')
  if (!response.ok) {
    throw new Error('无法读取浏览器 OCR 模型清单，请确认本地 OCR 后端已启动。')
  }
  return await response.json() as BrowserOcrManifest
}
