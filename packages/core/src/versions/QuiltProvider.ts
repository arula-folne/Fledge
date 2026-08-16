import { getQuiltLoaderVersionsByMinecraft } from '@xmcl/installer'
import type { LoaderVersion } from '@fledge/shared'
import type { LoaderVersionProvider } from './VersionProvider.js'

/** Quilt Meta API（@xmcl/installer 経由） */
export class QuiltProvider implements LoaderVersionProvider {
  readonly id = 'quilt' as const

  async fetchLoaderVersions(minecraftVersion: string): Promise<LoaderVersion[]> {
    const artifacts = await getQuiltLoaderVersionsByMinecraft({ minecraftVersion })
    return artifacts.map((a) => ({
      id: a.loader.version,
      version: a.loader.version,
      stable: a.loader.stable,
    }))
  }
}
