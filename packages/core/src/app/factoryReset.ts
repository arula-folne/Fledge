import fs from 'node:fs/promises'
import type { LauncherApp } from './createLauncherApp.js'

async function rmRetry(target: string, attempts = 5): Promise<void> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      await fs.rm(target, { recursive: true, force: true })
      return
    } catch (err) {
      lastError = err
      await new Promise((resolve) => setTimeout(resolve, 250 * (i + 1)))
    }
  }
  throw lastError
}

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
