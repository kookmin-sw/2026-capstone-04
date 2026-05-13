import Store from 'electron-store'
import type { AuthState, AuthUser } from '../../shared/respondy-types'

type PersistedAuth = {
  accessToken: string | null
  refreshToken: string | null
  user: AuthUser | null
}

const defaults: PersistedAuth = {
  accessToken: null,
  refreshToken: null,
  user: null,
}

export const authStore = new Store<PersistedAuth>({
  name: 'respondy-auth',
  defaults,
})

export function getStoredAccessToken(): string | null {
  return authStore.get('accessToken') ?? null
}

export function getStoredRefreshToken(): string | null {
  return authStore.get('refreshToken') ?? null
}

export function getStoredUser(): AuthUser | null {
  return authStore.get('user') ?? null
}

export function setAuthSession(payload: {
  accessToken: string
  refreshToken: string
  user: AuthUser
}): void {
  authStore.set({
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    user: payload.user,
  })
}

export function setStoredUser(user: AuthUser | null): void {
  authStore.set('user', user)
}

export function updateAccessToken(accessToken: string): void {
  authStore.set('accessToken', accessToken)
}

export function clearAuthSession(): void {
  authStore.set(defaults)
}

export function getStoredAuthState(): AuthState {
  const user = getStoredUser()
  const accessToken = getStoredAccessToken()
  return {
    isAuthenticated: Boolean(user && accessToken),
    user: user ?? null,
  }
}
