import type { UpdateCheckResult } from '@fledge/shared'
import type { Updater } from './Updater.js'

export class NoopUpdater implements Updater {
  async check(): Promise<UpdateCheckResult> {
    return { status: 'unavailable', messageKey: 'updater.noop' }
  }

  async downloadInstaller(): Promise<string> {
    throw new Error('updater.noop')
  }
}
