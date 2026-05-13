import {
  clearAuthSession,
  getStoredAccessToken,
  getStoredRefreshToken,
  updateAccessToken,
} from './auth-store'

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  auth?: boolean
  retryOnUnauthorized?: boolean
}

export class BackendApiError extends Error {
  status: number
  errors?: unknown

  constructor(message: string, status: number, errors?: unknown) {
    super(message)
    this.name = 'BackendApiError'
    this.status = status
    this.errors = errors
  }
}

function getApiBaseUrl(): string {
  const value = process.env.API_BASE_URL?.trim()
  if (!value) {
    throw new Error('API_BASE_URL is not set')
  }
  return value.replace(/\/+$/, '')
}

function toApiUrl(endpoint: string): string {
  return `${getApiBaseUrl()}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
}

async function parseResponseBody(res: Response): Promise<unknown> {
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return res.json()
  }

  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function extractErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string' && body.trim()) return body
  if (body && typeof body === 'object') {
    const message = (body as { message?: unknown }).message
    const detail = (body as { detail?: unknown }).detail
    if (typeof message === 'string' && message.trim()) return message
    if (typeof detail === 'string' && detail.trim()) return detail
  }
  return fallback
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getStoredRefreshToken()
  if (!refreshToken) return null

  const res = await fetch(toApiUrl('/auth/refresh/'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh: refreshToken }),
  })

  if (!res.ok) {
    clearAuthSession()
    return null
  }

  const body = (await parseResponseBody(res)) as { access?: unknown } | null
  const accessToken = typeof body?.access === 'string' ? body.access : null
  if (!accessToken) {
    clearAuthSession()
    return null
  }

  updateAccessToken(accessToken)
  return accessToken
}

export async function requestJson<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (options.auth) {
    const accessToken = getStoredAccessToken()
    if (!accessToken) {
      throw new BackendApiError('로그인이 필요합니다.', 401)
    }
    headers.Authorization = `Bearer ${accessToken}`
  }

  const res = await fetch(toApiUrl(endpoint), {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  if (res.status === 401 && options.auth && options.retryOnUnauthorized !== false) {
    const nextAccessToken = await refreshAccessToken()
    if (nextAccessToken) {
      return requestJson<T>(endpoint, {
        ...options,
        retryOnUnauthorized: false,
      })
    }
  }

  const body = await parseResponseBody(res)

  if (!res.ok) {
    throw new BackendApiError(
      extractErrorMessage(body, `Request failed with status ${res.status}`),
      res.status,
      body && typeof body === 'object'
        ? ((body as { errors?: unknown }).errors ?? body)
        : undefined,
    )
  }

  return body as T
}
