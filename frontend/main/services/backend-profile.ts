import type {
  UserProfile,
  UserProfileUpdateInput,
} from '../../shared/respondy-types'
import { requestJson } from './backend-client'

type UnknownRecord = Record<string, unknown>

type ProfileResponse = {
  data?: unknown
  user?: unknown
  profile?: unknown
  name?: unknown
  username?: unknown
  email?: unknown
  birth_date?: unknown
  birthDate?: unknown
  privacy_consent_at?: unknown
  privacyConsentAt?: unknown
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as UnknownRecord
}

function getProfileEndpoint(): string {
  return process.env.USER_PROFILE_ENDPOINT?.trim() || '/auth/profile/'
}

function getPrivacyConsentEndpoint(): string {
  return process.env.PRIVACY_CONSENT_ENDPOINT?.trim() || '/auth/privacy-consent/'
}

function normalizeProfile(body: unknown): UserProfile {
  const root = toRecord(body) ?? {}
  const data = toRecord(root.data) ?? {}
  const profile = toRecord(root.profile) ?? toRecord(data.profile) ?? {}
  const user = toRecord(root.user) ?? toRecord(data.user) ?? {}

  const name =
    toStringValue(profile.name) ||
    toStringValue(data.name) ||
    toStringValue(root.name) ||
    toStringValue(user.name) ||
    toStringValue(user.username) ||
    toStringValue(data.username) ||
    toStringValue(root.username)
  const email =
    toStringValue(profile.email) ||
    toStringValue(data.email) ||
    toStringValue(root.email) ||
    toStringValue(user.email)
  const birthDate =
    toStringValue(profile.birth_date) ||
    toStringValue(profile.birthDate) ||
    toStringValue(data.birth_date) ||
    toStringValue(data.birthDate) ||
    toStringValue(root.birth_date) ||
    toStringValue(root.birthDate) ||
    toStringValue(user.birth_date) ||
    toStringValue(user.birthDate)
  const privacyConsentAt =
    toStringValue(profile.privacy_consent_at) ||
    toStringValue(profile.privacyConsentAt) ||
    toStringValue(data.privacy_consent_at) ||
    toStringValue(data.privacyConsentAt) ||
    toStringValue(root.privacy_consent_at) ||
    toStringValue(root.privacyConsentAt) ||
    toStringValue(user.privacy_consent_at) ||
    toStringValue(user.privacyConsentAt)

  return {
    name,
    email,
    birthDate,
    privacyConsentAt,
  }
}

export async function getUserProfile(): Promise<UserProfile> {
  const body = await requestJson<ProfileResponse>(getProfileEndpoint(), {
    method: 'GET',
    auth: true,
  })
  return normalizeProfile(body)
}

export async function updateUserProfile(
  payload: UserProfileUpdateInput,
): Promise<UserProfile> {
  const name = payload.name.trim()
  const email = payload.email.trim()
  const birthDate = payload.birthDate.trim()
  if (!name && !email && !birthDate) {
    throw new Error('수정할 프로필 항목을 입력해 주세요.')
  }

  const bodyPayload: {
    name?: string
    email?: string
    birth_date?: string
  } = {}
  if (name) bodyPayload.name = name
  if (email) bodyPayload.email = email
  if (birthDate) bodyPayload.birth_date = birthDate

  const body = await requestJson<ProfileResponse>(getProfileEndpoint(), {
    method: 'PATCH',
    auth: true,
    body: bodyPayload,
  })

  return normalizeProfile(body)
}

export async function submitPrivacyConsent(): Promise<void> {
  await requestJson<unknown>(getPrivacyConsentEndpoint(), {
    method: 'POST',
    auth: true,
    body: {
      agreed: true,
    },
  })
}
