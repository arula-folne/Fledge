import type { UpdateCheckResult } from '@fledge/shared'

export interface Updater {
  check(): Promise<UpdateCheckResult>
}
