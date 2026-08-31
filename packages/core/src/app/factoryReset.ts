import path from 'node:path'
import type { LauncherApp } from './createLauncherApp.js'
import { rmRetry } from '../fs/rmRetry.js'

export type FactoryResetProgress = {
  current: number
  total: number
  messageKey: string
}

export type FactoryResetOptions = {
  /** 実効ルート以外にも消すゲームデータルート（instances / meta 等） */
  extraDataRoots?: string[]
  onProgress?: (progress: FactoryResetProgress) => void
}

async function safeRm(app: LauncherApp, target: string): Promise<void> {
  try {
    await rmRetry(target)
  } catch (err) {
    app.logger.warn(
      'system',
      `Factory reset could not remove ${target}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

/** 1 つの config ルート配下のゲームデータを削除（settingsRoot 側は触らない） */
async function wipeConfigRoot(app: LauncherApp, root: string): Promise<void> {
  const targets = [
    path.join(root, 'instances'),
    path.join(root, 'meta'),
    path.join(root, 'caches'),
    path.join(root, 'temp'),
    path.join(root, 'skins'),
    path.join(root, 'java'),
    path.join(root, 'logs'),
    path.join(root, 'news'),
    path.join(root, 'synced-options'),
    path.join(root, 'Data'),
    path.join(root, 'Instances'),
    path.join(root, 'profiles'),
  ]
  for (const target of targets) {
    await safeRm(app, target)
  }
}

function isDedicatedGameDataBundle(root: string): boolean {
  const base = path.basename(path.resolve(root)).toLowerCase()
  return base === 'data' || base === 'instance'
}

/** ゲームデータルートを中身ごと削除（instances / meta 等） */
async function wipeGameDataRoot(app: LauncherApp, root: string): Promise<void> {
  const resolved = path.resolve(root)
  await wipeConfigRoot(app, resolved)
  if (isDedicatedGameDataBundle(resolved)) {
    await safeRm(app, resolved)
  }
}

function uniqueRoots(roots: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const root of roots) {
    const resolved = path.resolve(root)
    const key = resolved.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(resolved)
  }
  return out
}

/**
 * 設定・アカウント・ゲームデータフォルダを削除する。空フォルダの作り直しは再起動後の
 * `ensurePathLayout` に任せる（終了中プロセスが Windows でフォルダを掴んだまま
 * 再作成すると、終了時に消えてログイン保存が失敗する）。
 */
export async function factoryReset(app: LauncherApp, options?: FactoryResetOptions): Promise<void> {
  const report = (current: number, total: number, messageKey: string) => {
    options?.onProgress?.({ current, total, messageKey })
  }

  const { paths: p } = app
  const dataRoots = uniqueRoots([p.root, ...(options?.extraDataRoots ?? [])])
  const totalSteps = 2 + dataRoots.length + 1
  let step = 0

  report(step, totalSteps, 'settings.factoryReset.progress.stopping')
  app.backup.cancelPending()
  app.queue.cancelAll()
  app.launch.stopAll()
  app.java.clearMemo()
  try {
    await app.sessionProxy.stop()
  } catch {
    /* ignore */
  }

  await new Promise((resolve) => setTimeout(resolve, 600))
  step += 1

  report(step, totalSteps, 'settings.factoryReset.progress.settings')
  await safeRm(app, p.settings)
  await safeRm(app, p.accounts)
  await safeRm(app, p.cache)
  await safeRm(app, p.minecraft)
  await safeRm(app, p.java)
  await safeRm(app, p.logs)
  await safeRm(app, p.news)
  await safeRm(app, p.temp)
  await safeRm(app, p.skins)
  await safeRm(app, p.instances)
  step += 1

  for (const root of dataRoots) {
    report(step, totalSteps, 'settings.factoryReset.progress.data')
    await wipeGameDataRoot(app, root)
    step += 1
  }

  report(step, totalSteps, 'settings.factoryReset.progress.done')
  app.logger.info('system', 'Factory reset completed')
}
