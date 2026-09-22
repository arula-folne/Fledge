import { getLoaderArtifactListFor } from '@xmcl/installer'
import { fledgeUserAgent, type LoaderVersion } from '@fledge/shared'
import type { LoaderVersionProvider } from './VersionProvider.js'

/** Fabric Meta API（ローダー一覧は @xmcl/installer 経由） */
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

  async fetchGameVersions(): Promise<string[]> {
    const res = await fetch('https://meta.fabricmc.net/v2/versions/game', {
      headers: { 'User-Agent': fledgeUserAgent('fabric-versions') },
    })
    if (!res.ok) throw new Error(`Fabric game versions HTTP ${res.status}`)
    const entries = (await res.json()) as Array<{ version?: string }>
    return entries.map((e) => e.version).filter((v): v is string => Boolean(v))
  }
}
