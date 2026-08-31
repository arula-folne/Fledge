import { app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { factoryReset, rmRetry, type LauncherApp } from '@fledge/core'
import {
  GAME_DATA_DIR,
  getDefaultFledgeRoot,
  getInstallDir,
  getSettingsRoot,
  readCustomRoot,
  readInstallDirPointer,
  writeCustomRoot,
} from '../paths/customRoot'

function uniqueRoots(roots: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const candidate of roots) {
    if (!candidate?.trim()) continue
    const resolved = path.resolve(candidate.trim())
    const key = resolved.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(resolved)
  }
  return out
}

/** 完全リセットで消すべきゲームデータルートを列挙（復元探索の候補も含む） */
export function collectFactoryResetDataRoots(activeRoot: string): string[] {
  const settingsRoot = getSettingsRoot()
  const installDir = getInstallDir()
  return uniqueRoots([
    activeRoot,
    getDefaultFledgeRoot(),
    readCustomRoot(),
    readInstallDirPointer(),
    path.join(settingsRoot, 'data'),
    path.join(installDir, GAME_DATA_DIR),
    path.join(installDir, 'Instance'),
    path.join(installDir, 'Data'),
    installDir,
  ])
}

async function safeRmSession(target: string): Promise<void> {
  try {
    await rmRetry(target)
  } catch {
    /* locked cache — best effort */
  }
}

/** 製品版向け: ポインタ・sessionData・レガシー AppData も含めて完全リセット */
export async function factoryResetDesktop(appCtx: LauncherApp): Promise<void> {
  const settingsRoot = getSettingsRoot()
  const extraDataRoots = collectFactoryResetDataRoots(appCtx.paths.root)

  await factoryReset(appCtx, { extraDataRoots })

  await safeRmSession(path.join(settingsRoot, 'data'))

  try {
    const sessionDir = app.getPath('sessionData')
    if (sessionDir && path.resolve(sessionDir) !== path.resolve(settingsRoot)) {
      await safeRmSession(sessionDir)
    }
  } catch {
    /* sessionData unavailable */
  }

  writeCustomRoot(null)

  appCtx.logger.info('system', `Factory reset wiped ${extraDataRoots.length} data root candidate(s)`)
}
