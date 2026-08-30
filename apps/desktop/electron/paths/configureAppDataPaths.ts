import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/** %APPDATA%\\fledge（設定・アカウント。Roaming） */
const APP_DATA_DIR_NAME = 'fledge'

export function getAppDataDirName(): string {
  return APP_DATA_DIR_NAME
}

function copyTreeIfMissing(from: string, to: string): void {
  if (!fs.existsSync(from)) return
  if (fs.existsSync(to)) return
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.cpSync(from, to, { recursive: true })
}

function migrateLegacyUserDataDir(from: string, to: string): void {
  if (!fs.existsSync(from)) return
  try {
    if (fs.realpathSync.native(from).toLowerCase() === fs.realpathSync.native(to).toLowerCase()) {
      return
    }
  } catch {
    if (path.resolve(from).toLowerCase() === path.resolve(to).toLowerCase()) return
  }
  try {
    fs.mkdirSync(to, { recursive: true })
    const entries = fs.readdirSync(from, { withFileTypes: true })
    for (const entry of entries) {
      const src = path.join(from, entry.name)
      const dest = path.join(to, entry.name)
      if (fs.existsSync(dest)) continue
      try {
        fs.renameSync(src, dest)
      } catch {
        copyTreeIfMissing(src, dest)
        fs.rmSync(src, { recursive: true, force: true })
      }
    }
    fs.rmSync(from, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
}

function ensureAppDataDirCase(appData: string, desiredName: string): string {
  const target = path.join(appData, desiredName)
  try {
    const existing = fs
      .readdirSync(appData)
      .find((name) => name.toLowerCase() === desiredName.toLowerCase())
    if (existing && existing !== desiredName) {
      const from = path.join(appData, existing)
      const tmp = path.join(appData, `${desiredName}.__tmp_rename__`)
      fs.renameSync(from, tmp)
      fs.renameSync(tmp, target)
    }
  } catch {
    /* ignore */
  }
  return target
}

function removeScopedAtFledge(appData: string): void {
  const scoped = path.join(appData, '@fledge')
  if (!fs.existsSync(scoped)) return
  try {
    fs.rmSync(scoped, { recursive: true, force: true })
  } catch {
    /* locked — retry next launch */
  }
}

/**
 * Windows 向けパス方針（Electron 公式推奨）:
 * - Roaming (%APPDATA%\\fledge): 設定・アカウントなど小さく残したいデータ
 * - Local (%LOCALAPPDATA%\\fledge): Chromium の Cache / GPUCache 等（sessionData）
 *
 * app.whenReady() より前に 1 回だけ呼ぶ。
 */
export function configureAppDataPaths(): void {
  try {
    app.setName('fledge')
  } catch {
    /* ignore */
  }

  if (!app.isPackaged) return

  const appData = app.getPath('appData')
  const target = ensureAppDataDirCase(appData, APP_DATA_DIR_NAME)
  fs.mkdirSync(target, { recursive: true })
  app.setPath('userData', target)

  try {
    const localAppData =
      process.env.LOCALAPPDATA?.trim() || path.join(path.dirname(appData), 'Local')
    const sessionDir = path.join(localAppData, APP_DATA_DIR_NAME)
    fs.mkdirSync(sessionDir, { recursive: true })
    app.setPath('sessionData', sessionDir)
  } catch {
    /* sessionData は userData のままでも動作する */
  }

  migrateLegacyUserDataDir(path.join(appData, '@fledge', 'desktop'), target)
  migrateLegacyUserDataDir(path.join(appData, 'Fledge'), target)
  removeScopedAtFledge(appData)
}
