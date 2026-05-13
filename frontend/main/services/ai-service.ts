import { GoogleGenerativeAI } from '@google/generative-ai'
import type {
  ReplySuggestion,
  ReplyTone,
  SentimentLabel,
  SentimentResult,
} from '../../shared/respondy-types'

function getGeminiApiKey(): string {
  const key =
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) {
    throw new Error(
      'GEMINI_API_KEY (또는 GOOGLE_API_KEY) 가 설정되어 있지 않습니다.',
    )
  }
  return key
}

function getGeminiModelId(): string {
  return process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
}

export async function analyzeSentimentKorean(
  text: string,
): Promise<SentimentResult> {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) {
    return {
      labels: [{ label: 'neutral', score: 1 }],
      dominant: 'neutral',
      summary: '분석할 텍스트가 없습니다.',
    }
  }

  const apiKey = getGeminiApiKey()
  const modelId = getGeminiModelId()
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: modelId,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
    systemInstruction:
      'You classify Korean message sentiment. Reply ONLY with valid JSON: {"labels":[{"label":"string","score":number}],"dominant":"string","summary":"string"}. labels: 2–4 items, scores in [0,1] (relative weights). dominant: the strongest label id. summary: one short Korean sentence describing tone.',
  })

  const result = await model.generateContent(
    `다음 메시지의 감정·톤을 분석하세요.\n\n"""${trimmed.slice(0, 4000)}"""`,
  )
  let raw = result.response.text()
  if (!raw?.trim()) {
    throw new Error('Gemini returned empty sentiment content')
  }
  raw = stripJsonFence(raw)

  let parsed: {
    labels?: Array<{ label?: string; score?: number }>
    dominant?: string
    summary?: string
  }
  try {
    parsed = JSON.parse(raw) as typeof parsed
  } catch {
    throw new Error(`Gemini sentiment JSON parse failed: ${raw.slice(0, 200)}`)
  }

  const labels = normalizeGeminiLabels(parsed.labels)
  const dominant =
    String(parsed.dominant ?? labels[0]?.label ?? 'unknown').trim() ||
    'unknown'
  const summary =
    String(parsed.summary ?? '').trim() ||
    summarizeLabels(labels)

  return { labels, dominant, summary }
}

function normalizeGeminiLabels(
  raw: Array<{ label?: string; score?: number }> | undefined,
): SentimentLabel[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [{ label: 'neutral', score: 1 }]
  }
  const out: SentimentLabel[] = []
  for (const item of raw) {
    const label = String(item?.label ?? 'unknown').trim() || 'unknown'
    let score = Number(item?.score ?? 0)
    if (!Number.isFinite(score)) score = 0
    score = Math.min(1, Math.max(0, score))
    out.push({ label, score })
  }
  out.sort((a, b) => b.score - a.score)
  return out.length ? out : [{ label: 'neutral', score: 1 }]
}

function summarizeLabels(labels: SentimentLabel[]): string {
  if (!labels.length) return '중립에 가까운 톤입니다.'
  const top = labels[0]
  return `주요 라벨: ${top.label} (${(top.score * 100).toFixed(1)}%)`
}

export async function generateReplySuggestions(params: {
  sender: string
  message: string
  sentimentSummary: string
  dominantLabel: string
}): Promise<ReplySuggestion[]> {
  const apiKey = getGeminiApiKey()
  const modelId = getGeminiModelId()

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: modelId,
    generationConfig: {
      temperature: 0.7,
      responseMimeType: 'application/json',
    },
    systemInstruction:
      'You are Respondy, a Korean communication coach. Reply ONLY with valid JSON: {"replies":[{"tone":"warm"|"witty"|"firm","text":"..."}]} — exactly three items, one per tone, short Korean drafts.',
  })

  const prompt = [
    `발신자: ${params.sender}`,
    `메시지: ${params.message}`,
    `감정 요약: ${params.sentimentSummary}`,
    `주요 감정 라벨: ${params.dominantLabel}`,
    '위 맥락에 맞는 답장 초안 3가지를 한국어로 작성하세요.',
  ].join('\n')

  const result = await model.generateContent(prompt)
  let raw = result.response.text()
  if (!raw?.trim()) {
    throw new Error('Gemini returned empty content')
  }
  raw = stripJsonFence(raw)

  const parsed = JSON.parse(raw) as {
    replies?: Array<{ tone?: string; text?: string }>
  }

  const byTone = new Map<string, string>()
  for (const r of parsed.replies ?? []) {
    const t = String(r.tone ?? '').toLowerCase()
    if (t && r.text) {
      byTone.set(t, r.text.trim())
    }
  }

  const tones: ReplyTone[] = ['warm', 'witty', 'firm']
  const replies: ReplySuggestion[] = tones.map((tone) => ({
    tone,
    text:
      byTone.get(tone) ||
      defaultFallback(tone, params.message),
  }))

  return replies
}

function stripJsonFence(text: string): string {
  const t = text.trim()
  if (!t.startsWith('```')) return t
  const withoutOpen = t.replace(/^```(?:json)?\s*/i, '')
  const end = withoutOpen.lastIndexOf('```')
  if (end === -1) return t
  return withoutOpen.slice(0, end).trim()
}

function defaultFallback(tone: ReplyTone, message: string): string {
  const preview = message.slice(0, 80)
  switch (tone) {
    case 'warm':
      return `말씀 잘 읽었어요. "${preview}"에 대해 조금 더 이야기 나눠도 될까요?`
    case 'witty':
      return `오늘 메시지 텐션 좋네요 — "${preview}" 저도 한번 생각해볼게요.`
    default:
      return `내용 확인했습니다. "${preview}" 관련해서는 이렇게 답하면 어떨까요?`
  }
}
