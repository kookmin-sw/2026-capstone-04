import type {
  ManualAnalysisInput,
  ManualAnalysisResult,
} from '../../shared/respondy-types'
import { requestJson } from './backend-client'

type UnknownRecord = Record<string, unknown>

function toStringValue(input: unknown): string {
  return typeof input === 'string' ? input.trim() : ''
}

function toSuggestions(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      if (item && typeof item === 'object') {
        return toStringValue(
          (item as { text?: unknown; content?: unknown }).text ??
            (item as { text?: unknown; content?: unknown }).content,
        )
      }
      return ''
    })
    .filter(Boolean)
}

function getEndpoint(): string {
  return process.env.MANUAL_ANALYSIS_ENDPOINT?.trim() || '/manual-analysis/'
}

function pickFirstObject(candidates: unknown[]): UnknownRecord | null {
  for (const item of candidates) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return item as UnknownRecord
    }
  }
  return null
}

function normalizeResult(body: unknown): ManualAnalysisResult {
  const root = pickFirstObject([body]) ?? {}
  const data = pickFirstObject([
    root.data,
    (root as { result?: unknown }).result,
    (root as { analysis?: unknown }).analysis,
  ])
  const analysis = pickFirstObject([
    data?.analysis_result,
    data?.analysis,
    data?.result,
    root.analysis_result,
    root.analysis,
    root.result,
  ])

  const source = analysis ?? data ?? root
  const emotion =
    toStringValue(source.summary) ||
    toStringValue(source.emotion) ||
    toStringValue(source.sentiment_summary) ||
    '분석 결과 없음'
  const context =
    toStringValue(source.strategy) ||
    toStringValue(source.context) ||
    toStringValue(source.tone) ||
    '맥락 결과 없음'
  const suggestionsFromRecommended = toSuggestions(source.recommended_replies)
  const suggestionsFromReplies = toSuggestions(source.replies)
  const suggestionsFromSuggestions = toSuggestions(source.suggestions)
  const suggestions =
    suggestionsFromRecommended.length > 0
      ? suggestionsFromRecommended
      : suggestionsFromReplies.length > 0
        ? suggestionsFromReplies
        : suggestionsFromSuggestions

  return {
    emotion,
    context,
    suggestions:
      suggestions.length > 0
        ? suggestions
        : ['추천 답장이 아직 생성되지 않았습니다.'],
  }
}

export async function analyzeManualConversation(
  input: ManualAnalysisInput,
): Promise<ManualAnalysisResult> {
  const avatarId = Number(input.avatarId)
  if (!Number.isFinite(avatarId) || avatarId <= 0) {
    throw new Error('유효한 아바타를 선택해 주세요.')
  }
  const situationContext = input.situationContext.trim()
  const receivedMessage = input.receivedMessage.trim()
  if (!situationContext || !receivedMessage) {
    throw new Error('상황 설명과 받은 메시지를 모두 입력해 주세요.')
  }

  const body = await requestJson<unknown>(getEndpoint(), {
    method: 'POST',
    auth: true,
    body: {
      avatar_id: avatarId,
      title: '수동 입력 대화 분석',
      platform_type: 'kakao',
      goal_type: 'general',
      situation_context: situationContext,
      analysis_goal: '부담스럽지 않게 대화를 이어가기',
      received_message: receivedMessage,
    },
  })
  return normalizeResult(body)
}
