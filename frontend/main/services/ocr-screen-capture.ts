import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { OcrRegion } from '../../shared/respondy-types'
import { Jimp, ResizeStrategy } from 'jimp'

const execFileAsync = promisify(execFile)
const INCOMING_ONLY_WIDTH_RATIO = 0.68
const FRAME_SIGNATURE_SIZE = 64
const DEBUG_CAPTURE_DIR = path.join(process.cwd(), 'debug-captures')
const DEBUG_CAPTURE_PATH = path.join(DEBUG_CAPTURE_DIR, 'latest.png')

export type FrameSignature = {
  width: number
  height: number
  pixels: Buffer
}
type JimpImage = Awaited<ReturnType<typeof Jimp.read>>

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function getIncomingOnlyWidth(width: number): number {
  return Math.max(32, Math.floor(width * INCOMING_ONLY_WIDTH_RATIO))
}

function cropIncomingOnly(image: JimpImage): JimpImage {
  image.crop({
    x: 0,
    y: 0,
    w: getIncomingOnlyWidth(image.bitmap.width),
    h: image.bitmap.height,
  })
  return image
}

async function cropIncomingOnlyBuffer(imageBuffer: Buffer): Promise<Buffer> {
  const image = await Jimp.read(imageBuffer)
  cropIncomingOnly(image)
  const out = await image.getBuffer('image/png')
  return Buffer.isBuffer(out) ? out : Buffer.from(out)
}

function shouldSaveDebugCapture(): boolean {
  return process.env.DEBUG_SAVE_CAPTURE === 'true'
}

function saveDebugCapture(imageBuffer: Buffer): void {
  if (!shouldSaveDebugCapture()) return

  try {
    fs.mkdirSync(DEBUG_CAPTURE_DIR, { recursive: true })
    fs.writeFileSync(DEBUG_CAPTURE_PATH, imageBuffer)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.warn(`[Respondy] Failed to save debug capture: ${message}`)
  }
}

export async function createFrameSignature(
  imageBuffer: Buffer,
): Promise<FrameSignature> {
  const image = await Jimp.read(imageBuffer)
  image.greyscale().resize({
    w: FRAME_SIGNATURE_SIZE,
    h: FRAME_SIGNATURE_SIZE,
    mode: ResizeStrategy.BILINEAR,
  })

  const data = image.bitmap.data
  const pixels = Buffer.alloc(FRAME_SIGNATURE_SIZE * FRAME_SIGNATURE_SIZE)
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    pixels[p] = data[i]
  }

  return {
    width: FRAME_SIGNATURE_SIZE,
    height: FRAME_SIGNATURE_SIZE,
    pixels,
  }
}

export function getFrameDifferenceRatio(
  a: FrameSignature,
  b: FrameSignature,
): number {
  if (a.width !== b.width || a.height !== b.height) return 1

  const len = Math.min(a.pixels.length, b.pixels.length)
  if (len === 0) return 1

  let diff = 0
  for (let i = 0; i < len; i += 1) {
    diff += Math.abs(a.pixels[i] - b.pixels[i])
  }

  return diff / (len * 255)
}

/**
 * macOS: `screencapture -R` (화면 기록 권한 필요)
 * Windows: 전체 화면 캡처 후 Jimp로 크롭
 */
export async function captureScreenRegion(
  region: OcrRegion,
  incomingOnly = false,
): Promise<Buffer> {
  const w = Math.max(8, Math.floor(region.width))
  const h = Math.max(8, Math.floor(region.height))
  const x = Math.floor(region.x)
  const y = Math.floor(region.y)

  if (process.platform === 'darwin') {
    const out = path.join(
      os.tmpdir(),
      `respondy-ocr-${process.pid}-${Date.now()}.png`,
    )
    try {
      await execFileAsync('/usr/sbin/screencapture', [
        '-x',
        '-R',
        `${x},${y},${w},${h}`,
        '-t',
        'png',
        out,
      ])
      const buf = fs.readFileSync(out)
      saveDebugCapture(buf)
      if (!incomingOnly) return buf
      return cropIncomingOnlyBuffer(buf)
    } finally {
      try {
        fs.unlinkSync(out)
      } catch {
        /* ignore */
      }
    }
  }

  if (process.platform === 'win32') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const screenshot =
      require('screenshot-desktop') as typeof import('screenshot-desktop')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const full = await screenshot({ format: 'png' })
    const image = await Jimp.read(full)
    const iw = image.bitmap.width
    const ih = image.bitmap.height
    const cx = clamp(x, 0, Math.max(0, iw - 1))
    const cy = clamp(y, 0, Math.max(0, ih - 1))
    const cw = clamp(w, 8, iw - cx)
    const ch = clamp(h, 8, ih - cy)
    image.crop({ x: cx, y: cy, w: cw, h: ch })
    const out = await image.getBuffer('image/png')
    const buf = Buffer.isBuffer(out) ? out : Buffer.from(out)
    saveDebugCapture(buf)
    if (!incomingOnly) return buf
    return cropIncomingOnlyBuffer(buf)
  }

  throw new Error(
    '이 플랫폼에서는 화면 OCR 캡처를 지원하지 않습니다. macOS 또는 Windows를 사용하세요.',
  )
}
