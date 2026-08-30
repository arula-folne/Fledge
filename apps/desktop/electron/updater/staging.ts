import { app } from 'electron'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/**
 * 更新用インストーラーの退避先。
 * インストールツリー外かつ `%LOCALAPPDATA%\\fledge` 配下にまとめ、
 * OS 一時領域に `fledge-update-*` を散らかさない。
 */
export function getUpdaterStagingDir(): string {
  try {
    return path.join(app.getPath('sessionData'), 'updater')
  } catch {
    const local =
      process.env.LOCALAPPDATA?.trim() || path.join(os.homedir(), 'AppData', 'Local')
    return path.join(local, 'fledge', 'updater')
  }
}

/** インストーラーを fledge\\updater へコピーし、そのパスを返す */
export async function stageUpdateInstaller(installerPath: string): Promise<string> {
  const dir = getUpdaterStagingDir()
  await fs.mkdir(dir, { recursive: true })
  const staged = path.join(dir, path.basename(installerPath))
  await fs.copyFile(installerPath, staged)
  return staged
}

/** 過去版が %TEMP% に残した fledge-update-* を掃除 */
export async function cleanupLegacyTempUpdateDirs(): Promise<void> {
  const tmp = os.tmpdir()
  let entries: string[]
  try {
    entries = await fs.readdir(tmp)
  } catch {
    return
  }
  await Promise.all(
    entries
      .filter((name) => name.startsWith('fledge-update-'))
      .map(async (name) => {
        try {
          await fs.rm(path.join(tmp, name), { recursive: true, force: true })
        } catch {
          /* locked — next launch */
        }
      }),
  )
}
