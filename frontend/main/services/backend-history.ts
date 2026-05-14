import type { AnalysisHistoryRecord } from '../../shared/respondy-types'
import { requestJson } from './backend-client'

type AvatarShape = {
  id?: unknown
  name?: unknown
  current_relation?: unknown
  target_relation?: unknown
}

type SessionShape = {
  id?: unknown
  title?: unknown
  analysis_type?: unknown
  avatar_name?: unknown
  latest_summary?: unknown
  latest_emotion?: unknown
  latest_tone?: unknown
  latest_risk_level?: unknown
  latest_capture_status?: unknown
  situation_context?: unknown
  created_at?: unknown
  updated_at?: unknown
  avatar?: AvatarShape | null
  latest_messages?: CaptureMessageShape[]
  latest_analysis?: CaptureAnalysisShape | null
}

type CaptureMessageShape = {
  id?: unknown
  sender_type?: unknown
  content?: unknown
  message_order?: unknown
}

type CaptureAnalysisShape = {
  id?: unknown
  summary?: unknown
  emotion?: unknown
  tone?: unknown
  risk_level?: unknown
  strategy?: unknown
  recommended_replies?: unknown
}

type CaptureShape = {
  id?: unknown
  created_at?: unknown
  detected_at?: unknown
  processing_completed_at?: unknown
  messages?: CaptureMessageShape[]
  analysis_results?: CaptureAnalysisShape[]
}

type ListEnvelope<T> =
  | T[]
  | {
      data?: unknown
      results?: unknown
    }

const REALTIME_GROUP_WINDOW_MS = 120_000

function getAnalysisHistoryEndpoint(): string {
  return process.env.ANALYSIS_HISTORY_ENDPOINT?.trim() || '/sessions/'
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toTimestamp(...candidates: unknown[]): number {
  for (const item of candidates) {
    if (typeof item !== 'string' || !item.trim()) continue
    const parsed = Date.parse(item)
    if (Number.isFinite(parsed)) return parsed
  }
  return Date.now()
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

function extractAnalysisItem(body: unknown): CaptureAnalysisShape | null {
  const list = extractList<CaptureAnalysisShape>(
    body as ListEnvelope<CaptureAnalysisShape>,
  )
  if (list.length > 0) return list[0] ?? null
  if (body && typeof body === 'object') {
    const data = (body as { data?: unknown }).data
    if (data && typeof data === 'object') {
      const nestedList = extractList<CaptureAnalysisShape>(
        data as ListEnvelope<CaptureAnalysisShape>,
      )
      if (nestedList.length > 0) return nestedList[0] ?? null
      return data as CaptureAnalysisShape
    }
    return body as CaptureAnalysisShape
  }
  return null
}

function normalizeSessionId(raw: unknown): number | null {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

function toSuggestions(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => toStringValue(item))
    .filter(Boolean)
}

function toHistorySource(value: unknown): 'realtime' | 'manual' {
  const raw = toStringValue(value).toLowerCase()
  if (raw.includes('manual')) return 'manual'
  return 'realtime'
}

function toSummaryKeyword(value: unknown): string {
  const text = toStringValue(value)
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '')
    .trim()
  if (!text) return ''

  const firstChunk = text.split(/[.,:;()\[\]\n]/)[0]?.trim() || text
  const compact = firstChunk.replace(/\s+/g, ' ').trim()
  return compact.slice(0, 12).trim()
}

function buildHistoryTitle(session: SessionShape, source: 'realtime' | 'manual'): string {
  const personName =
    toStringValue(session.avatar_name) || toStringValue(session.avatar?.name) || '상대'
  const keyword = toSummaryKeyword(session.latest_summary) || toSummaryKeyword(session.latest_analysis?.summary)
  if (keyword) {
    return `${personName} · ${keyword.slice(0, 10).trim()}`
  }

  const rawTitle = toStringValue(session.title)
  if (rawTitle) return rawTitle.slice(0, 14).trim()
  return `${personName} ${source === 'manual' ? '수동' : '실시간'} 분석`
}

function parseRecordIds(recordId: string): number[] {
  const raw = toStringValue(recordId)
  if (!raw) return []
  const encoded = raw.startsWith('grp:') ? raw.slice(4) : raw
  return encoded
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0)
}

function mergeRecordList(records: AnalysisHistoryRecord[]): AnalysisHistoryRecord | null {
  if (records.length === 0) return null
  const sorted = [...records].sort((a, b) => b.at - a.at)
  const latest = sorted[0]
  if (!latest) return null

  const allIds = sorted
    .flatMap((item) => parseRecordIds(item.id))
    .filter((id, index, arr) => arr.indexOf(id) === index)
  const mergedSuggestions = sorted
    .flatMap((item) => item.suggestions)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index)
  const mergedMessages = sorted
    .map((item) => toStringValue(item.receivedMessage))
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .join('\n')
    .trim()
  const mergedSections = sorted.flatMap((item) => item.analysisSections ?? [])

  return {
    ...latest,
    id: allIds.length > 1 ? `grp:${allIds.join(',')}` : String(allIds[0] ?? latest.id),
    receivedMessage: mergedMessages || latest.receivedMessage,
    suggestions:
      mergedSuggestions.length > 0
        ? mergedSuggestions
        : ['추천 답장이 아직 생성되지 않았습니다.'],
    analysisSections:
      mergedSections.length > 0
        ? mergedSections.map((section, index) => ({
            ...section,
            id: section.id || `${latest.id}-section-${index + 1}`,
          }))
        : latest.analysisSections,
  }
}

function uniqueStrings(values: string[]): string[] {
  return values
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index)
}

function collapseRealtimeRecords(records: AnalysisHistoryRecord[]): AnalysisHistoryRecord[] {
  const sorted = [...records].sort((a, b) => b.at - a.at)
  const groups: AnalysisHistoryRecord[][] = []

  for (const record of sorted) {
    if (record.source !== 'realtime') {
      groups.push([record])
      continue
    }

    const lastGroup = groups.at(-1)
    const last = lastGroup?.[0]
    if (!last || last.source !== 'realtime') {
      groups.push([record])
      continue
    }

    const sameKey =
      last.title === record.title &&
      last.situation === record.situation &&
      last.relation === record.relation &&
      last.goalRelation === record.goalRelation
    const nearEnough = Math.abs(last.at - record.at) <= REALTIME_GROUP_WINDOW_MS
    if (sameKey && nearEnough) {
      lastGroup.push(record)
      continue
    }
    groups.push([record])
  }

  return groups
    .map((group) => mergeRecordList(group))
    .filter((item): item is AnalysisHistoryRecord => Boolean(item))
    .sort((a, b) => b.at - a.at)
}

function toHistoryRecordFromSession(session: SessionShape): AnalysisHistoryRecord | null {
  const sessionId = normalizeSessionId(session.id)
  if (!sessionId) return null

  const latestAnalysis =
    session.latest_analysis && typeof session.latest_analysis === 'object'
      ? session.latest_analysis
      : null
  const latestMessages = Array.isArray(session.latest_messages)
    ? session.latest_messages
    : []

  const receivedMessage = latestMessages
    .map((item) => toStringValue(item?.content))
    .filter(Boolean)
    .join('\n')

  const summary =
    toStringValue(session.latest_summary) || toStringValue(latestAnalysis?.summary)
  const emotion =
    toStringValue(session.latest_emotion) || toStringValue(latestAnalysis?.emotion)
  const tone = toStringValue(session.latest_tone) || toStringValue(latestAnalysis?.tone)
  const strategy = toStringValue(latestAnalysis?.strategy)
  const suggestions = toSuggestions(latestAnalysis?.recommended_replies)
  const source = toHistorySource(session.analysis_type)
  const hasMeaningfulAnalysis =
    Boolean(summary) ||
    Boolean(emotion) ||
    Boolean(strategy) ||
    Boolean(tone) ||
    suggestions.length > 0 ||
    Boolean(receivedMessage)
  if (!hasMeaningfulAnalysis) return null

  return {
    id: String(sessionId),
    at: toTimestamp(session.updated_at, session.created_at),
    source,
    title: buildHistoryTitle(session, source),
    relation: toStringValue(session.avatar?.current_relation) || '—',
    goalRelation: toStringValue(session.avatar?.target_relation) || '—',
    situation: toStringValue(session.situation_context) || '분석 기록',
    receivedMessage: receivedMessage || undefined,
    emotion: summary || emotion || '분석 결과 없음',
    context: strategy || tone || '맥락 결과 없음',
    suggestions: suggestions.length > 0 ? suggestions : ['추천 답장이 아직 생성되지 않았습니다.'],
  }
}

async function buildDetailedRecordFromSession(
  sessionId: number,
  session: SessionShape,
): Promise<AnalysisHistoryRecord | null> {
  const base = toHistoryRecordFromSession(session)
  if (!base) return null

  let captures: CaptureShape[] = []
  try {
    const capturesBody = await requestJson<ListEnvelope<CaptureShape>>(
      `/sessions/${sessionId}/captures/`,
      {
        method: 'GET',
        auth: true,
      },
    )
    captures = extractList(capturesBody)
  } catch {
    return base
  }

  if (captures.length === 0) return base

  const sortedCaptures = [...captures].sort(
    (a, b) =>
      toTimestamp(a.processing_completed_at, a.detected_at, a.created_at) -
      toTimestamp(b.processing_completed_at, b.detected_at, b.created_at),
  )
  const perCapture = await Promise.all(
    sortedCaptures.map(async (capture) => {
      const captureId = normalizeSessionId(capture.id)
      const inlineMessages = Array.isArray(capture.messages) ? capture.messages : []
      const inlineAnalysis = Array.isArray(capture.analysis_results)
        ? (capture.analysis_results[0] ?? null)
        : null

      if (!captureId) {
        return {
          at: toTimestamp(
            capture.processing_completed_at,
            capture.detected_at,
            capture.created_at,
          ),
          messages: inlineMessages,
          analysis: inlineAnalysis,
        }
      }

      const [messages, analysis] = await Promise.all([
        inlineMessages.length > 0
          ? Promise.resolve(inlineMessages)
          : requestJson<ListEnvelope<CaptureMessageShape>>(
              `/captures/${captureId}/messages/`,
              {
                method: 'GET',
                auth: true,
              },
            )
              .then((body) => extractList(body))
              .catch(() => []),
        inlineAnalysis
          ? Promise.resolve(inlineAnalysis)
          : requestJson<unknown>(`/captures/${captureId}/analysis/`, {
              method: 'GET',
              auth: true,
            })
              .then((body) => extractAnalysisItem(body))
              .catch(() => null),
      ])

      return {
        at: toTimestamp(
          capture.processing_completed_at,
          capture.detected_at,
          capture.created_at,
        ),
        messages,
        analysis,
      }
    }),
  )

  const allMessages = perCapture
    .flatMap((item) => item.messages)
    .map((msg) => toStringValue(msg?.content))
    .filter(Boolean)

  const analysisSections = perCapture
    .map((item, index) => {
      const analysis = item.analysis
      if (!analysis) return null
      const emotion = toStringValue(analysis.summary) || toStringValue(analysis.emotion)
      const context = toStringValue(analysis.strategy) || toStringValue(analysis.tone)
      const suggestions = toSuggestions(analysis.recommended_replies)
      const hasContent =
        Boolean(emotion) || Boolean(context) || suggestions.length > 0
      if (!hasContent) return null
      return {
        id: `${sessionId}-${index + 1}`,
        at: item.at,
        emotion: emotion || '분석 결과 없음',
        context: context || '맥락 결과 없음',
        suggestions:
          suggestions.length > 0
            ? suggestions
            : ['추천 답장이 아직 생성되지 않았습니다.'],
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  const suggestionRows = analysisSections.flatMap((item) => item.suggestions)
  const latestCapture = sortedCaptures.at(-1)
  const latestSection = analysisSections.at(-1)

  return {
    ...base,
    at: toTimestamp(
      latestCapture?.processing_completed_at,
      latestCapture?.detected_at,
      latestCapture?.created_at,
      session.updated_at,
      session.created_at,
    ),
    receivedMessage: allMessages.join('\n') || base.receivedMessage,
    emotion: latestSection?.emotion || base.emotion,
    context: latestSection?.context || base.context,
    suggestions:
      suggestionRows.length > 0
        ? suggestionRows
        : base.suggestions,
    analysisSections:
      analysisSections.length > 0
        ? analysisSections
        : [
            {
              id: `${sessionId}-latest`,
              at: base.at,
              emotion: base.emotion,
              context: base.context,
              suggestions: base.suggestions,
            },
          ],
  }
}

export async function listAnalysisHistory(): Promise<AnalysisHistoryRecord[]> {
  const sessionsBody = await requestJson<ListEnvelope<SessionShape>>('/sessions/', {
    method: 'GET',
    auth: true,
  })
  const normalized = extractList(sessionsBody)
    .map((session) => toHistoryRecordFromSession(session))
    .filter((item): item is AnalysisHistoryRecord => Boolean(item))
    .sort((a, b) => b.at - a.at)
  return collapseRealtimeRecords(normalized)
}

export async function getAnalysisHistoryDetail(
  recordId: string,
): Promise<AnalysisHistoryRecord> {
  const ids = parseRecordIds(recordId)
  if (ids.length === 0) {
    throw new Error('분석 기록 id가 올바르지 않습니다.')
  }

  if (ids.length > 1) {
    const detailList = await Promise.all(
      ids.map(async (id) => {
        const body = await requestJson<SessionShape | { data?: unknown }>(
          `${getAnalysisHistoryEndpoint().replace(/\/+$/, '')}/${id}/`,
          {
            method: 'GET',
            auth: true,
          },
        )
        const source = body && typeof body === 'object' && 'data' in body && body.data
          ? (body.data as SessionShape)
          : (body as SessionShape)
        return buildDetailedRecordFromSession(id, source)
      }),
    )
    const merged = mergeRecordList(
      detailList.filter((item): item is AnalysisHistoryRecord => Boolean(item)),
    )
    if (!merged) {
      throw new Error('분석 기록 상세 응답 형식이 올바르지 않습니다.')
    }
    return merged
  }

  const id = String(ids[0])

  const body = await requestJson<SessionShape | { data?: unknown }>(
    `${getAnalysisHistoryEndpoint().replace(/\/+$/, '')}/${id}/`,
    {
      method: 'GET',
      auth: true,
    },
  )
  const source = body && typeof body === 'object' && 'data' in body && body.data
    ? (body.data as SessionShape)
    : (body as SessionShape)
  const normalized = await buildDetailedRecordFromSession(ids[0] ?? 0, source)
  if (!normalized) {
    throw new Error('분석 기록 상세 응답 형식이 올바르지 않습니다.')
  }
  return normalized
}

export async function deleteAnalysisHistoryRecord(recordId: string): Promise<void> {
  const ids = parseRecordIds(recordId)
  if (ids.length === 0) {
    throw new Error('분석 기록 id가 올바르지 않습니다.')
  }
  await Promise.all(
    ids.map((id) =>
      requestJson<unknown>(`/sessions/${id}/`, {
        method: 'DELETE',
        auth: true,
      }),
    ),
  )
}
