import path from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import type { UiScale } from '@fledge/shared'
import { LAUNCHER_WINDOW_MIN_HEIGHT, LAUNCHER_WINDOW_MIN_WIDTH } from '@fledge/shared'
import { resolveAppIconPath } from './appIcon'

/** 720p 時の見た目をノーマルとする。小窓（480p/540p）は自動で追加縮小する。 */
export const UI_SCALE_FACTORS: Record<UiScale, number> = {
  minimal: 0.85,
  normal: 1,
  wide: 1.2,
}

let activeUiScale: UiScale = 'normal'

/** 480p / 540p 帯では UI が崩れないようズーム上限を下げる */
function zoomCapForWindowSize(width: number, height: number): number {
  // 480p (854×480) 付近
  if (height <= 500 || width <= 900) return 0.68
  // 540p (960×540) 付近
  if (height <= 560 || width <= 1000) return 0.78
  return Number.POSITIVE_INFINITY
}

export function resolveWindowZoomFactor(
  scale: UiScale,
  width: number,
  height: number,
): number {
  const base = UI_SCALE_FACTORS[scale]
  return Math.round(Math.min(base, zoomCapForWindowSize(width, height)) * 1000) / 1000
}

export function applyWindowUiScale(win: BrowserWindow, scale: UiScale = activeUiScale): void {
  if (win.isDestroyed() || win.webContents.isDestroyed()) return
  activeUiScale = scale
  const [width, height] = win.getSize()
  const factor = resolveWindowZoomFactor(scale, width, height)
  if (Math.abs(win.webContents.getZoomFactor() - factor) < 0.005) return
  win.webContents.setZoomFactor(factor)
}

function attachWindowUiScale(win: BrowserWindow): void {
  void win.webContents.setVisualZoomLevelLimits(1, 1)
  const apply = () => applyWindowUiScale(win, activeUiScale)
  win.webContents.on('did-finish-load', apply)
  win.webContents.on('did-navigate', apply)
  // 端ドラッグで 480p/540p に入ったときも縮小を追従
  let resizeTimer: ReturnType<typeof setTimeout> | undefined
  win.on('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(apply, 50)
  })
}

export function createMainWindow(opts?: {
  width?: number
  height?: number
  x?: number
  y?: number
  uiScale?: UiScale
  /** true = OS タイトルバー、false = 枠なし（独自タイトルバー用） */
  frame?: boolean
}): BrowserWindow {
  const width = Math.min(7680, Math.max(LAUNCHER_WINDOW_MIN_WIDTH, opts?.width ?? 1280))
  const height = Math.min(4320, Math.max(LAUNCHER_WINDOW_MIN_HEIGHT, opts?.height ?? 720))
  const frame = opts?.frame ?? true
  activeUiScale = opts?.uiScale ?? 'normal'
  const icon = resolveAppIconPath()
  const win = new BrowserWindow({
    width,
    height,
    x: opts?.x,
    y: opts?.y,
    minWidth: LAUNCHER_WINDOW_MIN_WIDTH,
    minHeight: LAUNCHER_WINDOW_MIN_HEIGHT,
    title: 'Fledge',
    icon,
    backgroundColor: '#F7F9FC',
    show: false,
    frame,
    autoHideMenuBar: true,
    // Windows 枠なし時もリサイズしやすく
    thickFrame: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: true,
      v8CacheOptions: 'bypassHeatCheck',
    },
  })
  win.webContents.setBackgroundThrottling(true)
  win.setMenuBarVisibility(false)
  attachWindowUiScale(win)
  if (icon) {
    try {
      win.setIcon(icon)
    } catch {
      // icon missing in some unpackaged layouts
    }
  }

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('Renderer failed to load', { code, desc, url })
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('Renderer process gone', details)
  })
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) console.error('[renderer]', message, sourceId, line)
  })

  win.once('ready-to-show', () => {
    applyWindowUiScale(win)
    win.show()
  })

  // 開発時: F12 / Ctrl+Shift+I で DevTools（リサイズ時の右上サイズ表示は DevTools 開時のみ）
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (_event, input) => {
      if (input.type !== 'keyDown') return
      const toggle =
        input.key === 'F12' ||
        (input.key.toLowerCase() === 'i' && input.control && input.shift)
      if (!toggle) return
      if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools()
      else win.webContents.openDevTools({ mode: 'detach' })
    })
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        void shell.openExternal(url)
      }
    } catch {
      // ignore invalid URLs
    }
    return { action: 'deny' }
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    if (!app.isPackaged) console.log('Loading renderer URL:', rendererUrl)
    void win.loadURL(rendererUrl)
  } else {
    const file = path.join(__dirname, '../renderer/index.html')
    if (!app.isPackaged) console.log('Loading renderer file:', file)
    void win.loadFile(file)
  }

  return win
}

/** 端ドラッグ中のサイズを renderer へ流し、確定後に設定へ保存する */
export function attachWindowSizeSync(
  win: BrowserWindow,
  options: {
    emit: (size: { width: number; height: number }) => void
    persist: (size: { width: number; height: number }) => void
  },
): void {
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  let lastKey = ''

  const readSize = (): { width: number; height: number } | null => {
    if (win.isDestroyed() || win.isMaximized() || win.isFullScreen()) return null
    const [width, height] = win.getSize()
    return {
      width: Math.min(7680, Math.max(LAUNCHER_WINDOW_MIN_WIDTH, width)),
      height: Math.min(4320, Math.max(LAUNCHER_WINDOW_MIN_HEIGHT, height)),
    }
  }

  const onResize = () => {
    const size = readSize()
    if (!size) return
    const key = `${size.width}x${size.height}`
    if (key !== lastKey) {
      lastKey = key
      options.emit(size)
    }
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      const next = readSize()
      if (!next) return
      options.persist(next)
    }, 350)
  }

  win.on('resize', onResize)
  win.on('closed', () => {
    if (persistTimer) clearTimeout(persistTimer)
  })
}

export { resolveFledgeRoot } from '../paths/customRoot'
