import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

/**
 * 開発: apps/desktop/resources/icon.(png|ico)
 * 本番: extraResources で process.resourcesPath に配置
 */
export function resolveAppIconPath(): string {
  const dir = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, '../../resources')
  const ico = path.join(dir, 'icon.ico')
  const png = path.join(dir, 'icon.png')
  if (process.platform === 'win32' && fs.existsSync(ico)) return ico
  if (fs.existsSync(png)) return png
  return png
}
