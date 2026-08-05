import { getForgeVersionList } from '@xmcl/installer'
import type { LoaderVersion } from '@fledge/shared'
import type { LoaderVersionProvider } from './VersionProvider.js'

/** Forge 公式メタデータ（files.minecraftforge.net / maven） */
export class ForgeProvider implements LoaderVersionProvider {
  readonly id = 'forge' as const

  async fetchLoaderVersions(minecraftVersion: string): Promise<LoaderVersion[]> {
    const list = await getForgeVersionList({ minecraft: minecraftVersion })
    return (list.versions ?? []).map((v) => ({
      id: v.version,
      version: v.version,
      recommended: v.type === 'recommended',
      stable: v.type === 'recommended' || v.type === 'latest',
      type: v.type,
    }))
  }
}
