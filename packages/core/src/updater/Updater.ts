import type { UpdateCheckResult } from '@fledge/shared'

export interface Updater {
  check(): Promise<UpdateCheckResult>
  /** 利用可能な更新のインストーラーをダウンロードし、ローカルパスを返す */
  downloadInstaller(): Promise<string>
  /** 更新チェックキャッシュを捨てる（適用直前など） */
  clearCache(): Promise<void>
}
