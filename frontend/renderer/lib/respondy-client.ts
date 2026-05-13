import type { RespondyApi } from '../../shared/respondy-types'

export function getRespondy(): RespondyApi | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { respondy?: RespondyApi }).respondy ?? null
}
