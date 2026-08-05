import type { LoaderVersion, VersionInfo } from '@fledge/shared'

export type VersionFetchOptions = {
  /** true ならキャッシュを無視して再取得 */
  force?: boolean
}

/**
 * Minecraft / Loader バージョン取得の抽象。
 * ContentProvider と同様に配布元ごとに実装を分離する。
 */
export interface MinecraftVersionProvider {
  readonly id: 'mojang'
  fetchMinecraftVersions(): Promise<VersionInfo[]>
}

export interface LoaderVersionProvider {
  readonly id: 'fabric' | 'forge' | 'neoforge' | 'quilt'
  /**
   * 指定 MC 版に対応するローダー版一覧。
   * 対応が無ければ空配列。
   */
  fetchLoaderVersions(minecraftVersion: string): Promise<LoaderVersion[]>
}
