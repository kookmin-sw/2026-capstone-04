import { requestJson } from './backend-client'

type SessionEnvelope = {
  id?: unknown
  data?: {
    id?: unknown
  }
}

function normalizeSessionId(body: SessionEnvelope): number {
  const raw = body.data?.id ?? body.id
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('세션 생성 응답에서 id를 찾지 못했습니다.')
  }
  return id
}

export async function createRealtimeSession(params?: {
  title?: string
  situationContext?: string
  analysisGoal?: string
  avatarId?: number | null
}): Promise<number> {
  const payload: {
    title: string
    platform_type: 'kakao'
    goal_type: 'general'
    situation_context: string
    analysis_goal: string
    avatar_id?: number
  } = {
    title: params?.title?.trim() || 'Respondy 실시간 분석',
    platform_type: 'kakao',
    goal_type: 'general',
    situation_context: params?.situationContext?.trim() || '실시간 대화 분석',
    analysis_goal:
      params?.analysisGoal?.trim() || '상황에 맞는 답장 추천을 위한 감정 분석',
  }

  if (typeof params?.avatarId === 'number' && params.avatarId > 0) {
    payload.avatar_id = params.avatarId
  }

  const body = await requestJson<SessionEnvelope>('/sessions/', {
    method: 'POST',
    auth: true,
    body: payload,
  })
  return normalizeSessionId(body)
}

export async function endRealtimeSession(sessionId: number): Promise<void> {
  const id = Number(sessionId)
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('종료할 세션 id가 올바르지 않습니다.')
  }

  await requestJson<unknown>(`/sessions/${id}/end/`, {
    method: 'POST',
    auth: true,
  })
}
