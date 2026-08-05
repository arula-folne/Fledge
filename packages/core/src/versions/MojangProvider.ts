import { getVersionList } from '@xmcl/installer'
import type { VersionInfo } from '@fledge/shared'
import type { MinecraftVersionProvider } from './VersionProvider.js'

/** Mojang Version Manifest */
export class MojangProvider implements MinecraftVersionProvider {
  readonly id = 'mojang' as const

  async fetchMinecraftVersions(): Promise<VersionInfo[]> {
    const list = await getVersionList()
    return list.versions.map((v) => ({
      id: v.id,
      type: v.type as VersionInfo['type'],
      releaseTime: v.releaseTime,
    }))
  }
}
