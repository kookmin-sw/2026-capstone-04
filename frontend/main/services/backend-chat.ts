import { requestJson } from './backend-client'

type ChatStatus = 'active' | 'archived'
type SenderType = 'user' | 'assistant'

type ChatSessionEnvelope = {
  id?: unknown
  title?: unknown
  situation_context?: unknown
  status?: unknown
  avatar?: {
    id?: unknown
    name?: unknown
  } | null
}

type ChatMessageEnvelope = {
  id?: unknown
  sender_type?: unknown
  content?: unknown
  status?: unknown
  created_at?: unknown
}

type ChatDetailEnvelope = ChatSessionEnvelope & {
  messages?: unknown
}

type ChatSendMessageResponse = {
  data?: {
    user_message?: ChatMessageEnvelope
    assistant_message?: ChatMessageEnvelope
  }
}

type ListEnvelope<T> =
  | T[]
  | {
      data?: unknown
      results?: unknown
    }

export type CoachingChatMessage = {
  id: number
  senderType: SenderType
  content: string
  status: string
  createdAt: number
}

export type CoachingChatSession = {
  id: number
  avatarId: number | null
  avatarName: string
  title: string
  situationContext: string
  status: ChatStatus
  messages: CoachingChatMessage[]
}

export type CoachingChatCreateInput = {
  avatarId: number
  title: string
  situationContext: string
}

export type CoachingChatUpdateInput = {
  title?: string
  situationContext?: string
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toTimestamp(value: unknown): number {
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return Date.now()
}

function toSenderType(value: unknown): SenderType {
  return toStringValue(value).toLowerCase() === 'assistant' ? 'assistant' : 'user'
}

function toStatus(value: unknown): ChatStatus {
  return toStringValue(value).toLowerCase() === 'archived' ? 'archived' : 'active'
}

function toChatMessage(raw: ChatMessageEnvelope): CoachingChatMessage | null {
  const id = Number(raw.id)
  if (!Number.isFinite(id) || id <= 0) return null
  return {
    id,
    senderType: toSenderType(raw.sender_type),
    content: toStringValue(raw.content),
    status: toStringValue(raw.status) || 'completed',
    createdAt: toTimestamp(raw.created_at),
  }
}

function extractList<T>(body: ListEnvelope<T>): T[] {
  if (Array.isArray(body)) return body
  if (body && typeof body === 'object') {
    const results = (body as { results?: unknown }).results
    if (Array.isArray(results)) return results as T[]
    const data = (body as { data?: unknown }).data
    if (Array.isArray(data)) return data as T[]
    if (data && typeof data === 'object') {
      const nestedResults = (data as { results?: unknown }).results
      if (Array.isArray(nestedResults)) return nestedResults as T[]
    }
  }
  return []
}

function toChatSession(raw: ChatSessionEnvelope): CoachingChatSession | null {
  const id = Number(raw.id)
  if (!Number.isFinite(id) || id <= 0) return null
  const avatarIdValue = Number(raw.avatar?.id)
  const avatarId =
    Number.isFinite(avatarIdValue) && avatarIdValue > 0 ? avatarIdValue : null
  return {
    id,
    avatarId,
    avatarName: toStringValue(raw.avatar?.name),
    title: toStringValue(raw.title),
    situationContext: toStringValue(raw.situation_context),
    status: toStatus(raw.status),
    messages: [],
  }
}

function toChatDetail(raw: ChatDetailEnvelope): CoachingChatSession | null {
  const base = toChatSession(raw)
  if (!base) return null
  const messages = Array.isArray(raw.messages)
    ? raw.messages
        .map((item) => toChatMessage(item as ChatMessageEnvelope))
        .filter((item): item is CoachingChatMessage => Boolean(item))
    : []
  return {
    ...base,
    messages,
  }
}

function getBaseEndpoint(): string {
  return process.env.COACHING_CHAT_ENDPOINT?.trim() || '/coaching/chats/'
}

function getSessionEndpoint(chatId: number): string {
  return `${getBaseEndpoint().replace(/\/+$/, '')}/${chatId}/`
}

export async function listCoachingChats(
  status: 'active' | 'archived' | 'all' = 'all',
): Promise<CoachingChatSession[]> {
  const endpoint = `${getBaseEndpoint()}?status=${status}`
  const body = await requestJson<ListEnvelope<ChatSessionEnvelope>>(endpoint, {
    method: 'GET',
    auth: true,
  })
  return extractList(body)
    .map((item) => toChatSession(item))
    .filter((item): item is CoachingChatSession => Boolean(item))
}

export async function createCoachingChat(
  payload: CoachingChatCreateInput,
): Promise<CoachingChatSession> {
  const avatarId = Number(payload.avatarId)
  if (!Number.isFinite(avatarId) || avatarId <= 0) {
    throw new Error('유효한 인물(아바타)을 선택해 주세요.')
  }
  const title = payload.title.trim()
  const situationContext = payload.situationContext.trim()
  if (!title || !situationContext) {
    throw new Error('채팅 제목과 상황 설명을 입력해 주세요.')
  }
  const body = await requestJson<ChatSessionEnvelope | { data?: unknown }>(
    getBaseEndpoint(),
    {
      method: 'POST',
      auth: true,
      body: {
        avatar_id: avatarId,
        title,
        situation_context: situationContext,
      },
    },
  )
  const source =
    body && typeof body === 'object' && 'data' in body && body.data
      ? (body.data as ChatSessionEnvelope)
      : (body as ChatSessionEnvelope)
  const normalized = toChatSession(source)
  if (!normalized) throw new Error('AI 챗 세션 생성 응답 형식이 올바르지 않습니다.')
  return normalized
}

export async function getCoachingChatDetail(
  chatId: number,
): Promise<CoachingChatSession> {
  const id = Number(chatId)
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('유효한 챗 세션 id가 아닙니다.')
  }
  const body = await requestJson<ChatDetailEnvelope | { data?: unknown }>(
    getSessionEndpoint(id),
    {
      method: 'GET',
      auth: true,
    },
  )
  const source =
    body && typeof body === 'object' && 'data' in body && body.data
      ? (body.data as ChatDetailEnvelope)
      : (body as ChatDetailEnvelope)
  const normalized = toChatDetail(source)
  if (!normalized) throw new Error('AI 챗 상세 응답 형식이 올바르지 않습니다.')
  return normalized
}

export async function updateCoachingChat(
  chatId: number,
  payload: CoachingChatUpdateInput,
): Promise<CoachingChatSession> {
  const id = Number(chatId)
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('유효한 챗 세션 id가 아닙니다.')
  }
  const title = payload.title?.trim()
  const situationContext = payload.situationContext?.trim()
  if (!title && !situationContext) {
    throw new Error('수정할 내용이 없습니다.')
  }
  const body = await requestJson<ChatDetailEnvelope | { data?: unknown }>(
    getSessionEndpoint(id),
    {
      method: 'PATCH',
      auth: true,
      body: {
        ...(title ? { title } : {}),
        ...(situationContext ? { situation_context: situationContext } : {}),
      },
    },
  )
  const source =
    body && typeof body === 'object' && 'data' in body && body.data
      ? (body.data as ChatDetailEnvelope)
      : (body as ChatDetailEnvelope)
  const normalized = toChatDetail(source)
  if (!normalized) throw new Error('AI 챗 수정 응답 형식이 올바르지 않습니다.')
  return normalized
}

export async function sendCoachingChatMessage(
  chatId: number,
  content: string,
): Promise<{ userMessage: CoachingChatMessage; assistantMessage: CoachingChatMessage }> {
  const id = Number(chatId)
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('유효한 챗 세션 id가 아닙니다.')
  }
  const text = content.trim()
  if (!text) throw new Error('전송할 메시지를 입력해 주세요.')
  const body = await requestJson<ChatSendMessageResponse>(
    `${getSessionEndpoint(id)}messages/`,
    {
      method: 'POST',
      auth: true,
      body: {
        content: text,
      },
    },
  )
  const userMessage = toChatMessage(body.data?.user_message ?? {})
  const assistantMessage = toChatMessage(body.data?.assistant_message ?? {})
  if (!userMessage || !assistantMessage) {
    throw new Error('AI 챗 메시지 응답 형식이 올바르지 않습니다.')
  }
  return { userMessage, assistantMessage }
}

export async function retryCoachingChat(chatId: number): Promise<CoachingChatSession> {
  const id = Number(chatId)
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('유효한 챗 세션 id가 아닙니다.')
  }
  await requestJson<unknown>(`${getSessionEndpoint(id)}retry/`, {
    method: 'POST',
    auth: true,
  })
  return getCoachingChatDetail(id)
}

export async function archiveCoachingChat(chatId: number): Promise<void> {
  const id = Number(chatId)
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('유효한 챗 세션 id가 아닙니다.')
  }
  await requestJson<unknown>(`${getSessionEndpoint(id)}archive/`, {
    method: 'POST',
    auth: true,
  })
}
