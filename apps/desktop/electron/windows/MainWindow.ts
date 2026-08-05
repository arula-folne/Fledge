import path from 'node:path'
import { app, BrowserWindow, shell } from 'electron'

export function createMainWindow(opts?: {
  width?: number
  height?: number
  x?: number
  y?: number
  /** true = OS タイトルバー、false = 枠なし（独自タイトルバー用） */
  frame?: boolean
}): BrowserWindow {
  const width = Math.min(7680, Math.max(900, opts?.width ?? 1280))
  const height = Math.min(4320, Math.max(600, opts?.height ?? 720))
  const frame = opts?.frame ?? true
  const win = new BrowserWindow({
    width,
    height,
    x: opts?.x,
    y: opts?.y,
    minWidth: 900,
    minHeight: 600,
    title: 'Fledge',
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
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    console.log('Loading renderer URL:', rendererUrl)
    void win.loadURL(rendererUrl)
  } else {
    const file = path.join(__dirname, '../renderer/index.html')
    console.log('Loading renderer file:', file)
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
