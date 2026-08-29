import type { UpdateChannel, UpdateCheckResult } from '@fledge/shared'
import type { Updater } from './Updater.js'

export class NoopUpdater implements Updater {
  async check(_channel?: UpdateChannel): Promise<UpdateCheckResult> {
    return { status: 'unavailable', messageKey: 'updater.noop' }
  }

  async downloadInstaller(_channel?: UpdateChannel): Promise<string> {
    throw new Error('updater.noop')
  }

  async clearCache(): Promise<void> {
    /* noop */
  }

  async fetchReleaseNotes(_version: string): Promise<string | undefined> {
    return undefined
  }
}
