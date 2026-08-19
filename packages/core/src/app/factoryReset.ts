import fs from 'node:fs/promises'
import { ensurePathLayout } from './paths.js'
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
 * Data/ と Instances/ を削除し、空のディレクトリと既定設定を作り直す。
 * 呼び出し側でアプリ再起動すること。
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

  await new Promise((resolve) => setTimeout(resolve, 400))

  await rmRetry(app.paths.data)
  await rmRetry(app.paths.instances)
  await ensurePathLayout(app.paths)
  await app.settings.reset()
  app.logger.info('system', 'Factory reset completed')
}
