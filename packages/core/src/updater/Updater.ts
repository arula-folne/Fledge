import type { UpdateChannel, UpdateCheckResult } from '@fledge/shared'

export type UpdaterDownloadProgress = {
  current: number
  total: number
  percent?: number
}

export interface Updater {
  check(channel?: UpdateChannel): Promise<UpdateCheckResult>
  /** 利用可能な更新のインストーラーをダウンロードし、ローカルパスを返す */
  downloadInstaller(
    channel?: UpdateChannel,
    onProgress?: (p: UpdaterDownloadProgress) => void,
  ): Promise<string>
  /** 更新チェックキャッシュを捨てる（適用直前など） */
  clearCache(): Promise<void>
  /** 指定版の GitHub Release 本文（変更点）を取得 */
  fetchReleaseNotes(version: string): Promise<string | undefined>
}
