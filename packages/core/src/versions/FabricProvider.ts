import { getLoaderArtifactListFor } from '@xmcl/installer'
import type { LoaderVersion } from '@fledge/shared'
import type { LoaderVersionProvider } from './VersionProvider.js'

/** Fabric Meta API（@xmcl/installer 経由） */
export class FabricProvider implements LoaderVersionProvider {
  readonly id = 'fabric' as const

  async fetchLoaderVersions(minecraftVersion: string): Promise<LoaderVersion[]> {
    const artifacts = await getLoaderArtifactListFor(minecraftVersion)
    return artifacts.map((a) => ({
      id: a.loader.version,
      version: a.loader.version,
      stable: a.loader.stable,
    }))
  }
}
