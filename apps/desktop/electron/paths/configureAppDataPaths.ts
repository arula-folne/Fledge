import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const APP_DATA_DIR_NAME = 'Fledge'

/** Electron userData の表示名（%APPDATA%\\Fledge）。@fledge/desktop を使わない */
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
  if (path.resolve(from) === path.resolve(to)) return
  try {
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

/**
 * userData を %APPDATA%\\Fledge に固定する。app.whenReady() より前に 1 回だけ呼ぶ。
 */
export function configureAppDataPaths(): void {
  if (!app.isPackaged) return

  const target = path.join(app.getPath('appData'), APP_DATA_DIR_NAME)
  if (app.getPath('userData') !== target) {
    app.setPath('userData', target)
  }

  migrateLegacyUserDataDir(path.join(app.getPath('appData'), '@fledge', 'desktop'), target)
}
