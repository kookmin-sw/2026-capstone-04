import Store from 'electron-store'
import type { OcrSettings } from '../../shared/respondy-types'

const defaults: OcrSettings = {
  enabled: true,
  intervalMs: 1800,
  region: { x: 80, y: 80, width: 420, height: 520 },
  incomingOnly: true,
}

export const ocrSettingsStore = new Store<OcrSettings>({
  name: 'respondy-ocr',
  defaults,
})
