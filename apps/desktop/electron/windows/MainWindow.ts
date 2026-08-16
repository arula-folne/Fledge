import path from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import type { UiScale } from '@fledge/shared'
import { resolveAppIconPath } from './appIcon'

/** 720p 時の見た目をノーマルとする。ウィンドウ解像度では拡縮しない。 */
export const UI_SCALE_FACTORS: Record<UiScale, number> = {
  minimal: 0.85,
  normal: 1,
  wide: 1.2,
}

let activeUiScale: UiScale = 'normal'

export function applyWindowUiScale(win: BrowserWindow, scale: UiScale = activeUiScale): void {
  if (win.isDestroyed() || win.webContents.isDestroyed()) return
  activeUiScale = scale
  const factor = Math.round(UI_SCALE_FACTORS[scale] * 1000) / 1000
  if (Math.abs(win.webContents.getZoomFactor() - factor) < 0.005) return
  win.webContents.setZoomFactor(factor)
}

function attachWindowUiScale(win: BrowserWindow): void {
  void win.webContents.setVisualZoomLevelLimits(1, 1)
  const apply = () => applyWindowUiScale(win, activeUiScale)
  win.webContents.on('did-finish-load', apply)
  win.webContents.on('did-navigate', apply)
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
  const width = Math.min(7680, Math.max(900, opts?.width ?? 1280))
  const height = Math.min(4320, Math.max(600, opts?.height ?? 720))
  const frame = opts?.frame ?? true
  activeUiScale = opts?.uiScale ?? 'normal'
  const icon = resolveAppIconPath()
  const win = new BrowserWindow({
    width,
    height,
    x: opts?.x,
    y: opts?.y,
    minWidth: 900,
    minHeight: 600,
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
    },
  })
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

/** 本番は exe 隣、開発は apps/desktop/.fledge-root */
export function resolveFledgeRoot(): string {
  if (!app.isPackaged) {
    return path.join(app.getAppPath(), '.fledge-root')
  }
  return path.dirname(app.getPath('exe'))
}
