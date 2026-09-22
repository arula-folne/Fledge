import { getQuiltLoaderVersionsByMinecraft } from '@xmcl/installer'
import { fledgeUserAgent, type LoaderVersion } from '@fledge/shared'
import type { LoaderVersionProvider } from './VersionProvider.js'

/** Quilt Meta API（ローダー一覧は @xmcl/installer 経由） */
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

  async fetchGameVersions(): Promise<string[]> {
    const res = await fetch('https://meta.quiltmc.org/v3/versions/game', {
      headers: { 'User-Agent': fledgeUserAgent('quilt-versions') },
    })
    if (!res.ok) throw new Error(`Quilt game versions HTTP ${res.status}`)
    const entries = (await res.json()) as Array<{ version?: string }>
    return entries.map((e) => e.version).filter((v): v is string => Boolean(v))
  }
}
