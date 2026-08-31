import path from 'node:path'
import type { LauncherApp } from './createLauncherApp.js'
import { rmRetry } from '../fs/rmRetry.js'

export type FactoryResetOptions = {
  /** 実効ルート以外にも消すゲームデータルート（instances / meta 等） */
  extraDataRoots?: string[]
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

/**
 * 設定・アカウント・ゲームデータフォルダを削除する。空フォルダの作り直しは再起動後の
 * `ensurePathLayout` に任せる（終了中プロセスが Windows でフォルダを掴んだまま
 * 再作成すると、終了時に消えてログイン保存が失敗する）。
 */
export async function factoryReset(app: LauncherApp, options?: FactoryResetOptions): Promise<void> {
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

  const { paths: p } = app
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
  await wipeConfigRoot(app, p.root)

  const active = path.resolve(p.root)
  for (const root of options?.extraDataRoots ?? []) {
    if (path.resolve(root) === active) continue
    await wipeConfigRoot(app, root)
  }

  app.logger.info('system', 'Factory reset completed')
}
