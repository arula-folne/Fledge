import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

function resourcesDir(): string {
  return app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, '../../resources')
}

/**
 * 開発: apps/desktop/resources/icon.(png|ico)
 * 本番: extraResources で process.resourcesPath に配置
 */
export function resolveAppIconPath(): string {
  const dir = resourcesDir()
  const ico = path.join(dir, 'icon.ico')
  const png = path.join(dir, 'icon.png')
  if (process.platform === 'win32' && fs.existsSync(ico)) return ico
  if (fs.existsSync(png)) return png
  return png
}

/** Microsoft ログイン用ウィンドウのアイコン（4色タイル） */
export function resolveMicrosoftLoginIconPath(): string | null {
  const dir = resourcesDir()
  const ico = path.join(dir, 'microsoft-login.ico')
  const png = path.join(dir, 'microsoft-login.png')
  if (process.platform === 'win32' && fs.existsSync(ico)) return ico
  if (fs.existsSync(png)) return png
  return null
}
