import type { OcrSettings } from '../../shared/respondy-types'
import {
  captureScreenRegion,
  createFrameSignature,
  getFrameDifferenceRatio,
  type FrameSignature,
} from './ocr-screen-capture'
import {
  extractTextFromImage,
  type CaptureAnalysisSnapshot,
} from './backend-ocr'

export type OcrLoopHandle = { stop: () => void }
export type OcrDetectionPayload = {
  text: string
  analysis: CaptureAnalysisSnapshot | null
}
const FRAME_CHANGE_THRESHOLD = 0.035
const DEBUG_OCR_LOG = process.env.DEBUG_OCR_LOG === 'true'

function stripKakaoTime(text: string): string {
  return text
    .replace(/\b(오전|오후)\s*\d{1,2}:\d{2}\b/g, '')
    .replace(/\b\d{1,2}:\d{2}\b/g, '')
}

function logOcrDebug(message: string, extra?: Record<string, unknown>) {
  if (!DEBUG_OCR_LOG) return
  if (extra) {
    console.log(`[Respondy][OCR] ${message}`, extra)
    return
  }
  console.log(`[Respondy][OCR] ${message}`)
}

/**
 * 주기적으로 화면 영역을 캡처해 프레임 변화가 감지될 때만 OCR을 실행.
 */
export function startOcrLoop(
  getSettings: () => OcrSettings,
  getSessionId: () => number | null,
  onDetection: (payload: OcrDetectionPayload) => void,
  onError?: (err: Error) => void,
): OcrLoopHandle {
  let timer: ReturnType<typeof setInterval> | null = null
  let lastFrameSignature: FrameSignature | null = null
  let lastNormalized = ''
  let busy = false

  const tick = async () => {
    const s = getSettings()
    if (!s.enabled) {
      logOcrDebug('skip tick: OCR disabled')
      return
    }
    if (s.region.width < 8 || s.region.height < 8) {
      logOcrDebug('skip tick: region too small', {
        width: s.region.width,
        height: s.region.height,
      })
      return
    }
    if (busy) {
      logOcrDebug('skip tick: previous tick still running')
      return
    }
    busy = true
    try {
      const buf = await captureScreenRegion(s.region, s.incomingOnly)
      const signature = await createFrameSignature(buf)
      if (lastFrameSignature) {
        const diffRatio = getFrameDifferenceRatio(lastFrameSignature, signature)
        if (diffRatio < FRAME_CHANGE_THRESHOLD) {
          logOcrDebug('skip tick: frame not changed enough', {
            diffRatio,
            threshold: FRAME_CHANGE_THRESHOLD,
          })
          return
        }
        logOcrDebug('frame changed', {
          diffRatio,
          threshold: FRAME_CHANGE_THRESHOLD,
        })
      }
      lastFrameSignature = signature

      const sessionId = getSessionId()
      if (!sessionId) {
        logOcrDebug('skip tick: no active session id')
        return
      }
      const extraction = await extractTextFromImage(buf, sessionId)
      if (extraction.skipped) {
        logOcrDebug('skip tick: backend marked capture as skipped', {
          code: extraction.skippedCode || 'unknown',
        })
        return
      }
      const cleaned = stripKakaoTime(extraction.text)
      const norm = cleaned.replace(/\s+/g, ' ').trim()
      if (norm.length < 2) {
        logOcrDebug('skip tick: OCR text too short', {
          rawLength: extraction.text.length,
          normalizedLength: norm.length,
          hasAnalysis: Boolean(extraction.analysis),
        })
        return
      }
      if (norm === lastNormalized) {
        logOcrDebug('skip tick: duplicated normalized text', {
          normalizedLength: norm.length,
        })
        return
      }
      lastNormalized = norm
      logOcrDebug('emit OCR detection', {
        normalizedLength: norm.length,
        hasAnalysis: Boolean(extraction.analysis),
        suggestionsCount: extraction.analysis?.recommendedReplies?.length ?? 0,
      })
      onDetection({
        text: norm,
        analysis: extraction.analysis,
      })
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      onError?.(err)
    } finally {
      busy = false
    }
  }

  const arm = () => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    const s = getSettings()
    if (!s.enabled) return
    const ms = Math.max(500, Math.min(15000, s.intervalMs || 1800))
    void tick()
    timer = setInterval(() => {
      void tick()
    }, ms)
  }

  arm()

  return {
    stop: () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      lastFrameSignature = null
      lastNormalized = ''
    },
  }
}
