import path from 'path'
import dotenv from 'dotenv'
import { app, ipcMain, BrowserWindow, screen } from 'electron'
import serve from 'electron-serve'
import { createWindow } from './helpers'
import {
  analyzeSentimentKorean,
  generateReplySuggestions,
} from './services/ai-service'
import type {
  LoginInput,
  ManualAnalysisInput,
  PasswordChangeInput,
  NotificationPayload,
  OcrRegion,
  OcrSettings,
  RealtimeDetectionStartInput,
  SignupInput,
} from '../shared/respondy-types'
import {
  getAuthState,
  login,
  logout,
  signup,
} from './services/auth-service'
import { ocrSettingsStore } from './services/ocr-settings'
import { startOcrLoop } from './services/ocr-loop'
import { createRealtimeSession, endRealtimeSession } from './services/backend-session'
import {
  createAvatar,
  deleteAvatar,
  listAvatars,
  updateAvatar,
} from './services/backend-avatar'
import {
  deleteAnalysisHistoryRecord,
  getAnalysisHistoryDetail,
  listAnalysisHistory,
} from './services/backend-history'
import { analyzeManualConversation } from './services/backend-manual'
import {
  getUserProfile,
  submitPrivacyConsent,
  updateUserProfile,
} from './services/backend-profile'
import { changePassword } from './services/backend-password'

const isProd = process.env.NODE_ENV === 'production'
const DEBUG_OCR_LOG = process.env.DEBUG_OCR_LOG === 'true'

const envDir = path.join(__dirname, '..')
dotenv.config({ path: path.join(envDir, '.env') })
dotenv.config({ path: path.join(envDir, '.env.local') })

if (isProd) {
  serve({ directory: 'app' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

let mainWindow: BrowserWindow | null = null
let regionPickerWindow: BrowserWindow | null = null
let ocrLoopHandle: ReturnType<typeof startOcrLoop> | null = null
let isRealtimeDetectionActive = false
let isRealtimeDetectionTransitioning = false
let activeRealtimeSessionId: number | null = null
let resolveRegionPicker: ((value: OcrRegion | null) => void) | null = null

function sendToRenderer(
  win: BrowserWindow | null,
  channel: string,
  payload: NotificationPayload,
) {
  if (!win || win.isDestroyed()) return
  try {
    win.webContents.send(channel, payload)
  } catch {
    // 창이 닫히는 순간 레이스로 webContents가 이미 파괴된 경우
  }
}

function broadcastNotification(payload: NotificationPayload) {
  const channel = 'notification-detected'
  if (DEBUG_OCR_LOG && payload.source === 'ocr') {
    console.log('[Respondy][OCR] broadcast notification', {
      messageLength: payload.message?.length ?? 0,
      hasSummary: Boolean(payload.summary),
      suggestionsCount: payload.recommendedReplies?.length ?? 0,
    })
  }
  sendToRenderer(mainWindow, channel, payload)
}

function restartOcrLoop() {
  ocrLoopHandle?.stop()
  ocrLoopHandle = null
  if (!isRealtimeDetectionActive) return
  const s = ocrSettingsStore.store
  if (!s.enabled) return
  ocrLoopHandle = startOcrLoop(
    () => ocrSettingsStore.store,
    () => activeRealtimeSessionId,
    (payload) => {
      broadcastNotification({
        sender: 'OCR',
        message: payload.text.slice(0, 8000),
        source: 'ocr',
        receivedAt: Date.now(),
        summary: payload.analysis?.summary,
        emotion: payload.analysis?.emotion,
        tone: payload.analysis?.tone,
        riskLevel: payload.analysis?.riskLevel,
        strategy: payload.analysis?.strategy,
        recommendedReplies: payload.analysis?.recommendedReplies ?? [],
      })
    },
    (err) => {
      if (/session is already ended/i.test(err.message)) {
        if (DEBUG_OCR_LOG) {
          console.log('[Respondy][OCR] ignore ended-session capture race')
        }
        return
      }
      console.error('[Respondy] OCR:', err.message)
    },
  )
}

function normalizeRegion(region: OcrRegion): OcrRegion {
  return {
    x: Math.floor(region.x),
    y: Math.floor(region.y),
    width: Math.max(8, Math.floor(region.width)),
    height: Math.max(8, Math.floor(region.height)),
  }
}

async function openRegionPicker(): Promise<OcrRegion | null> {
  if (resolveRegionPicker) {
    throw new Error('영역 선택이 이미 진행 중입니다.')
  }

  const display = screen.getPrimaryDisplay()
  const { bounds } = display

  regionPickerWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: true,
    focusable: true,
    skipTaskbar: true,
    fullscreenable: false,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  regionPickerWindow.setAlwaysOnTop(true, 'screen-saver')
  regionPickerWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  })
  regionPickerWindow.setFullScreenable(false)
  regionPickerWindow.setMenuBarVisibility(false)

  if (isProd) {
    await regionPickerWindow.loadURL('app://./region-picker/')
  } else {
    const port = process.argv[2]
    await regionPickerWindow.loadURL(`http://localhost:${port}/region-picker/`)
  }
  regionPickerWindow.show()
  regionPickerWindow.focus()

  return new Promise<OcrRegion | null>((resolve) => {
    resolveRegionPicker = resolve
    regionPickerWindow?.once('closed', () => {
      regionPickerWindow = null
      if (resolveRegionPicker) {
        resolveRegionPicker(null)
        resolveRegionPicker = null
      }
    })
  })
}

function completeRegionPicker(region: OcrRegion | null) {
  if (!resolveRegionPicker) return
  resolveRegionPicker(region)
  resolveRegionPicker = null
  if (regionPickerWindow && !regionPickerWindow.isDestroyed()) {
    regionPickerWindow.close()
  }
  regionPickerWindow = null
}

;(async () => {
  await app.whenReady()

  mainWindow = createWindow('main', {
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    title: 'Respondy',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  /* loadURL 전에 등록해야 렌더러 첫 invoke 시 핸들러가 없다는 오류가 나지 않음 */
  ipcMain.handle('analyze-sentiment', async (_evt, text: string) => {
    return analyzeSentimentKorean(String(text ?? ''))
  })

  ipcMain.handle(
    'generate-replies',
    async (
      _evt,
      payload: {
        sender: string
        message: string
        sentimentSummary: string
        dominantLabel: string
      },
    ) => {
      return generateReplySuggestions(payload)
    },
  )

  ipcMain.handle('auth:get-state', () => getAuthState())

  ipcMain.handle('auth:login', (_evt, payload: LoginInput) => {
    return login(payload)
  })

  ipcMain.handle('auth:signup', (_evt, payload: SignupInput) => {
    return signup(payload)
  })

  ipcMain.handle('auth:logout', () => logout())

  ipcMain.handle('ocr:get-settings', () => ocrSettingsStore.store)

  ipcMain.handle('ocr:set-settings', (_evt, partial: Partial<OcrSettings>) => {
    const cur = ocrSettingsStore.store
    const next: OcrSettings = {
      ...cur,
      ...partial,
      region: partial.region
        ? { ...cur.region, ...partial.region }
        : cur.region,
    }
    ocrSettingsStore.set(next)
    restartOcrLoop()
  })

  ipcMain.handle('ocr:start', async (_evt, input?: RealtimeDetectionStartInput) => {
    if (isRealtimeDetectionActive || isRealtimeDetectionTransitioning) return
    isRealtimeDetectionTransitioning = true
    try {
      activeRealtimeSessionId = await createRealtimeSession({
        title: input?.title,
        situationContext: input?.situationContext,
        analysisGoal: input?.analysisGoal,
        avatarId: input?.avatarId ?? null,
      })
      if (DEBUG_OCR_LOG) {
        console.log('[Respondy][OCR] realtime detection started', {
          sessionId: activeRealtimeSessionId,
        })
      }
      isRealtimeDetectionActive = true
      restartOcrLoop()
    } finally {
      isRealtimeDetectionTransitioning = false
    }
  })

  ipcMain.handle('ocr:stop', async () => {
    if (isRealtimeDetectionTransitioning) return
    isRealtimeDetectionTransitioning = true
    try {
      const sessionId = activeRealtimeSessionId
      isRealtimeDetectionActive = false
      activeRealtimeSessionId = null
      ocrLoopHandle?.stop()
      ocrLoopHandle = null

      if (sessionId) {
        try {
          await endRealtimeSession(sessionId)
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'failed to end realtime session'
          console.error('[Respondy][OCR] failed to end realtime session', {
            sessionId,
            message,
          })
        }
      }
      if (DEBUG_OCR_LOG) {
        console.log('[Respondy][OCR] realtime detection stopped', {
          sessionId,
        })
      }
    } finally {
      isRealtimeDetectionTransitioning = false
    }
  })

  ipcMain.handle('ocr:get-runtime-state', () => ({
    active: isRealtimeDetectionActive,
  }))

  ipcMain.handle('ocr:pick-region', async () => {
    const picked = await openRegionPicker()
    if (!picked) return null
    const region = normalizeRegion(picked)
    ocrSettingsStore.set({
      ...ocrSettingsStore.store,
      region,
    })
    restartOcrLoop()
    return region
  })

  ipcMain.on('ocr:picker-submit', (_evt, region: OcrRegion) => {
    if (!region) return
    completeRegionPicker(normalizeRegion(region))
  })

  ipcMain.on('ocr:picker-cancel', () => {
    completeRegionPicker(null)
  })

  ipcMain.handle('ocr:get-display-bounds', () => {
    const { bounds } = screen.getPrimaryDisplay()
    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    }
  })

  ipcMain.handle('avatar:list', () => listAvatars())
  ipcMain.handle('avatar:create', (_evt, payload) => createAvatar(payload))
  ipcMain.handle('avatar:update', (_evt, avatarId: number, payload) =>
    updateAvatar(avatarId, payload),
  )
  ipcMain.handle('avatar:delete', (_evt, avatarId: number) =>
    deleteAvatar(avatarId),
  )
  ipcMain.handle('analysis:history:list', () => listAnalysisHistory())
  ipcMain.handle('analysis:history:detail', (_evt, recordId: string) =>
    getAnalysisHistoryDetail(recordId),
  )
  ipcMain.handle('analysis:history:delete', (_evt, recordId: string) =>
    deleteAnalysisHistoryRecord(recordId),
  )
  ipcMain.handle('analysis:manual', (_evt, payload: ManualAnalysisInput) =>
    analyzeManualConversation(payload),
  )
  ipcMain.handle('profile:get', () => getUserProfile())
  ipcMain.handle('profile:update', (_evt, payload) => updateUserProfile(payload))
  ipcMain.handle('privacy:consent', () => submitPrivacyConsent())
  ipcMain.handle('password:change', (_evt, payload: PasswordChangeInput) =>
    changePassword(payload),
  )

  if (isProd) {
    await mainWindow.loadURL('app://./')
  } else {
    const port = process.argv[2]
    await mainWindow.loadURL(`http://localhost:${port}/`)
  }

  // 실시간 감지 시작 버튼을 누른 이후에만 루프를 시작한다.

  app.on('before-quit', () => {
    completeRegionPicker(null)
    ocrLoopHandle?.stop()
    ocrLoopHandle = null
  })
})()

app.on('window-all-closed', () => {
  app.quit()
})

ipcMain.on('message', async (event, arg) => {
  event.reply('message', `${arg} World!`)
})
