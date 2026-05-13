import type { RespondyApi } from '../shared/respondy-types'

export {}

declare global {
  interface Window {
    respondy: RespondyApi
    ipc: {
      send(channel: string, value: unknown): void
      on(channel: string, callback: (...args: unknown[]) => void): () => void
    }
  }
}
