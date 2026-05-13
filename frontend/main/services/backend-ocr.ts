import { requestJson } from './backend-client'

type CaptureMessage = {
  content?: unknown
}

type CaptureAnalysisResponse = {
  success?: unknown
  data?: {
    messages?: CaptureMessage[]
    analysis_results?: Array<{
      summary?: unknown
      emotion?: unknown
      tone?: unknown
      risk_level?: unknown
      strategy?: unknown
      recommended_replies?: unknown
    }>
  }
}

export type CaptureAnalysisSnapshot = {
  summary: string
  emotion: string
  tone: string
  riskLevel: string
  strategy: string
  recommendedReplies: string[]
}

export type CaptureExtractionResult = {
  text: string
  analysis: CaptureAnalysisSnapshot | null
}

function getCaptureEndpoint(sessionId: number): string {
  const template =
    process.env.OCR_EXTRACT_ENDPOINT?.trim() || '/sessions/{session_id}/captures/'
  if (template.includes('{session_id}')) {
    return template.replace('{session_id}', String(sessionId))
  }
  return `/sessions/${sessionId}/captures/`
}

function extractText(body: CaptureAnalysisResponse): string {
  const messages = body.data?.messages
  if (!Array.isArray(messages) || messages.length === 0) return ''
  return messages
    .map((item) => (typeof item?.content === 'string' ? item.content.trim() : ''))
    .filter(Boolean)
    .join('\n')
}

export async function extractTextFromImage(
  image: Buffer,
  sessionId: number,
): Promise<CaptureExtractionResult> {
  const body = await requestJson<CaptureAnalysisResponse>(
    getCaptureEndpoint(sessionId),
    {
    method: 'POST',
    auth: true,
    body: {
      session_id: sessionId,
      image_base64: `data:image/png;base64,${image.toString('base64')}`,
      source_type: 'electron',
      screen_context: {
        masked: true,
      },
    },
    },
  )

  const analysisRaw = body.data?.analysis_results?.[0]
  const recommendedReplies = Array.isArray(analysisRaw?.recommended_replies)
    ? analysisRaw?.recommended_replies
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    : []
  const analysis: CaptureAnalysisSnapshot | null = analysisRaw
    ? {
        summary:
          typeof analysisRaw.summary === 'string' ? analysisRaw.summary : '',
        emotion:
          typeof analysisRaw.emotion === 'string' ? analysisRaw.emotion : '',
        tone: typeof analysisRaw.tone === 'string' ? analysisRaw.tone : '',
        riskLevel:
          typeof analysisRaw.risk_level === 'string' ? analysisRaw.risk_level : '',
        strategy:
          typeof analysisRaw.strategy === 'string' ? analysisRaw.strategy : '',
        recommendedReplies,
      }
    : null

  return {
    text: extractText(body),
    analysis,
  }
}
