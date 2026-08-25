import type { LauncherApp } from './createLauncherApp.js'
import { rmRetry } from '../fs/rmRetry.js'

/**
 * Data/ と Instances/ を削除する。空フォルダの作り直しは再起動後の
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

  await rmRetry(app.paths.data)
  await rmRetry(app.paths.instances)
  app.logger.info('system', 'Factory reset completed')
}
