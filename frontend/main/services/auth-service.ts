import type {
  AuthState,
  AuthUser,
  LoginInput,
  SignupInput,
} from '../../shared/respondy-types'
import { requestJson } from './backend-client'
import {
  clearAuthSession,
  getStoredAccessToken,
  getStoredAuthState,
  setAuthSession,
  setStoredUser,
} from './auth-store'

type AuthEnvelope = {
  success?: boolean
  message?: string
  data?: {
    user?: AuthUser
    access?: string
    refresh?: string
  }
}

type MeEnvelope = {
  success?: boolean
  data?: AuthUser
}

function validatePasswordPolicy(password: string): string | null {
  if (password.length < 8) return '비밀번호는 8자 이상이어야 합니다.'
  if (!/[A-Za-z]/.test(password))
    return '비밀번호에 영문자를 최소 1자 포함해 주세요.'
  if (!/\d/.test(password)) return '비밀번호에 숫자를 최소 1자 포함해 주세요.'
  return null
}

export async function login(payload: LoginInput): Promise<AuthState> {
  const body = await requestJson<AuthEnvelope>('/auth/login/', {
    method: 'POST',
    body: payload,
  })
  return persistAuthEnvelope(body)
}

export async function signup(payload: SignupInput): Promise<AuthState> {
  const passwordPolicyError = validatePasswordPolicy(payload.password)
  if (passwordPolicyError) {
    throw new Error(passwordPolicyError)
  }
  const body = await requestJson<AuthEnvelope>('/auth/signup/', {
    method: 'POST',
    body: payload,
  })
  return persistAuthEnvelope(body)
}

export async function logout(): Promise<void> {
  try {
    if (getStoredAccessToken()) {
      await requestJson('/auth/logout/', {
        method: 'POST',
        auth: true,
      })
    }
  } finally {
    clearAuthSession()
  }
}

export async function getAuthState(): Promise<AuthState> {
  const stored = getStoredAuthState()
  if (!stored.isAuthenticated) return stored

  try {
    const body = await requestJson<MeEnvelope>('/auth/me/', {
      auth: true,
    })
    const user = body.data
    if (!user) {
      clearAuthSession()
      return { isAuthenticated: false, user: null }
    }
    setStoredUser(user)
    return { isAuthenticated: true, user }
  } catch {
    return getStoredAuthState()
  }
}

function persistAuthEnvelope(body: AuthEnvelope): AuthState {
  const accessToken = body.data?.access
  const refreshToken = body.data?.refresh
  const user = body.data?.user

  if (!accessToken || !refreshToken || !user) {
    throw new Error('인증 응답 형식이 올바르지 않습니다.')
  }

  setAuthSession({
    accessToken,
    refreshToken,
    user,
  })

  return {
    isAuthenticated: true,
    user,
  }
}
