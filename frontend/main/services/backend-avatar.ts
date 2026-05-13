import { requestJson } from './backend-client'

type AvatarEnvelope = {
  id?: unknown
  name?: unknown
  age_group?: unknown
  current_relation?: unknown
  target_relation?: unknown
  personality?: unknown
  speech_style?: unknown
  background?: unknown
  memo?: unknown
  created_at?: unknown
}

type AvatarListResponse =
  | AvatarEnvelope[]
  | {
      data?: unknown
      results?: unknown
    }

type AvatarWriteResponse =
  | AvatarEnvelope
  | {
      data?: unknown
    }

export type AvatarProfile = {
  id: number
  name: string
  ageGroup: string
  currentRelation: string
  targetRelation: string
  personality: string
  speechStyle: string
  background: string
  memo: string
  createdAt: number
}

export type AvatarCreateInput = {
  name: string
  ageGroup?: string
  currentRelation?: string
  targetRelation?: string
  personality?: string
  speechStyle?: string
  background?: string
  memo?: string
}

export type AvatarUpdateInput = AvatarCreateInput

function toStringValue(input: unknown): string {
  return typeof input === 'string' ? input.trim() : ''
}

function toTimestamp(input: unknown): number {
  if (typeof input === 'string' && input.trim()) {
    const value = Date.parse(input)
    if (Number.isFinite(value)) return value
  }
  return Date.now()
}

function normalizeAvatar(raw: AvatarEnvelope): AvatarProfile {
  const id = Number(raw.id)
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('아바타 응답에 유효한 id가 없습니다.')
  }
  return {
    id,
    name: toStringValue(raw.name),
    ageGroup: toStringValue(raw.age_group),
    currentRelation: toStringValue(raw.current_relation),
    targetRelation: toStringValue(raw.target_relation),
    personality: toStringValue(raw.personality),
    speechStyle: toStringValue(raw.speech_style),
    background: toStringValue(raw.background),
    memo: toStringValue(raw.memo),
    createdAt: toTimestamp(raw.created_at),
  }
}

function extractAvatarList(body: AvatarListResponse): AvatarEnvelope[] {
  if (Array.isArray(body)) return body
  if (body && typeof body === 'object') {
    const results = (body as { results?: unknown }).results
    if (Array.isArray(results)) return results as AvatarEnvelope[]
    const data = (body as { data?: unknown }).data
    if (Array.isArray(data)) return data as AvatarEnvelope[]
    if (data && typeof data === 'object') {
      const innerResults = (data as { results?: unknown }).results
      if (Array.isArray(innerResults)) return innerResults as AvatarEnvelope[]
    }
  }
  return []
}

function extractAvatarSingle(body: AvatarWriteResponse): AvatarEnvelope {
  if (body && typeof body === 'object') {
    if (typeof (body as AvatarEnvelope).id !== 'undefined') {
      return body as AvatarEnvelope
    }
    const data = (body as { data?: unknown }).data
    if (data && typeof data === 'object') return data as AvatarEnvelope
  }
  throw new Error('아바타 응답 형식이 올바르지 않습니다.')
}

function toPayload(input: AvatarCreateInput) {
  return {
    name: input.name.trim(),
    age_group: input.ageGroup?.trim() || '',
    current_relation: input.currentRelation?.trim() || '',
    target_relation: input.targetRelation?.trim() || '',
    personality: input.personality?.trim() || '',
    speech_style: input.speechStyle?.trim() || '',
    background: input.background?.trim() || '',
    memo: input.memo?.trim() || '',
    is_active: true,
  }
}

export async function listAvatars(): Promise<AvatarProfile[]> {
  const body = await requestJson<AvatarListResponse>('/avatars/', {
    method: 'GET',
    auth: true,
  })
  const rows = extractAvatarList(body)
  return rows
    .map((row) => {
      try {
        return normalizeAvatar(row)
      } catch {
        return null
      }
    })
    .filter((item): item is AvatarProfile => Boolean(item))
}

export async function createAvatar(input: AvatarCreateInput): Promise<AvatarProfile> {
  const name = input.name.trim()
  if (!name) {
    throw new Error('아바타 이름을 입력해 주세요.')
  }
  const body = await requestJson<AvatarWriteResponse>('/avatars/', {
    method: 'POST',
    auth: true,
    body: toPayload(input),
  })
  return normalizeAvatar(extractAvatarSingle(body))
}

export async function updateAvatar(
  avatarId: number,
  input: AvatarUpdateInput,
): Promise<AvatarProfile> {
  if (!Number.isFinite(avatarId) || avatarId <= 0) {
    throw new Error('수정할 아바타 id가 올바르지 않습니다.')
  }
  const name = input.name.trim()
  if (!name) {
    throw new Error('아바타 이름을 입력해 주세요.')
  }
  const body = await requestJson<AvatarWriteResponse>(`/avatars/${avatarId}/`, {
    method: 'PATCH',
    auth: true,
    body: toPayload(input),
  })
  return normalizeAvatar(extractAvatarSingle(body))
}

export async function deleteAvatar(avatarId: number): Promise<void> {
  if (!Number.isFinite(avatarId) || avatarId <= 0) {
    throw new Error('삭제할 아바타 id가 올바르지 않습니다.')
  }
  await requestJson<unknown>(`/avatars/${avatarId}/`, {
    method: 'DELETE',
    auth: true,
  })
}
