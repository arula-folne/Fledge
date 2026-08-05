import type { LoaderVersion } from '@fledge/shared'
import type { LoaderVersionProvider } from './VersionProvider.js'

/** Quilt — 将来実装用スタブ */
export class QuiltProvider implements LoaderVersionProvider {
  readonly id = 'quilt' as const

  async fetchLoaderVersions(_minecraftVersion: string): Promise<LoaderVersion[]> {
    return []
  }
}
