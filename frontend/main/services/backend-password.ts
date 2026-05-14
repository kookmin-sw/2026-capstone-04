import type { PasswordChangeInput } from '../../shared/respondy-types'
import { requestJson } from './backend-client'

function getPasswordChangeEndpoint(): string {
  return process.env.PASSWORD_CHANGE_ENDPOINT?.trim() || '/auth/password/'
}

function validatePasswordPolicy(password: string): string | null {
  if (password.length < 8) return '비밀번호는 8자 이상이어야 합니다.'
  if (!/[A-Za-z]/.test(password))
    return '비밀번호에 영문자를 최소 1자 포함해 주세요.'
  if (!/\d/.test(password)) return '비밀번호에 숫자를 최소 1자 포함해 주세요.'
  return null
}

export async function changePassword(payload: PasswordChangeInput): Promise<void> {
  const currentPassword = payload.currentPassword
  const newPassword = payload.newPassword
  const confirmPassword = payload.confirmPassword

  if (!currentPassword || !newPassword || !confirmPassword) {
    throw new Error('현재 비밀번호와 새 비밀번호를 모두 입력해 주세요.')
  }
  if (newPassword !== confirmPassword) {
    throw new Error('새 비밀번호와 확인 비밀번호가 일치하지 않습니다.')
  }
  if (currentPassword === newPassword) {
    throw new Error('새 비밀번호는 현재 비밀번호와 다르게 입력해 주세요.')
  }
  const passwordPolicyError = validatePasswordPolicy(newPassword)
  if (passwordPolicyError) {
    throw new Error(passwordPolicyError)
  }

  await requestJson<unknown>(getPasswordChangeEndpoint(), {
    method: 'POST',
    auth: true,
    body: {
      current_password: currentPassword,
      new_password: newPassword,
      new_password_confirm: confirmPassword,
    },
  })
}
