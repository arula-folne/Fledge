import path from 'node:path'
import type { LauncherApp } from './createLauncherApp.js'
import { rmRetry } from '../fs/rmRetry.js'

/**
 * 設定・アカウント・ゲームデータフォルダを削除する。空フォルダの作り直しは再起動後の
 * `ensurePathLayout` に任せる（終了中プロセスが Windows でフォルダを掴んだまま
 * 再作成すると、終了時に消えてログイン保存が失敗する）。
 */
export async function factoryReset(app: LauncherApp): Promise<void> {
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
  await rmRetry(p.settings)
  await rmRetry(p.accounts)
  await rmRetry(p.cache)
  await rmRetry(p.minecraft)
  await rmRetry(p.java)
  await rmRetry(p.logs)
  await rmRetry(p.news)
  await rmRetry(p.temp)
  await rmRetry(p.skins)
  await rmRetry(p.instances)
  // 旧レイアウト
  await rmRetry(path.join(p.root, 'Data'))
  await rmRetry(path.join(p.root, 'Instances'))
  app.logger.info('system', 'Factory reset completed')
}
