import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/** %APPDATA%\\fledge（小文字。npm スコープ @fledge は使わない） */
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
  // Windows は大文字小文字を同一視するため、実パス比較では足りない
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

/** Windows で Fledge → fledge のように表示名の大文字小文字だけ直す */
function ensureAppDataDirCase(appData: string, desiredName: string): string {
  const target = path.join(appData, desiredName)
  try {
    const existing = fs.readdirSync(appData).find((name) => name.toLowerCase() === desiredName.toLowerCase())
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
    /* ロック中は次回。エクスプローラーから手動削除も可 */
  }
}

/**
 * userData を %APPDATA%\\fledge に固定する。app.whenReady() より前に 1 回だけ呼ぶ。
 * package.json の name が @fledge/desktop でも、ここが優先される。
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
  app.setPath('userData', target)

  migrateLegacyUserDataDir(path.join(appData, '@fledge', 'desktop'), target)
  removeScopedAtFledge(appData)
}
