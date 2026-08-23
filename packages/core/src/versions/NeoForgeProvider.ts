import type { LoaderVersion } from '@fledge/shared'
import type { LoaderVersionProvider } from './VersionProvider.js'

/**
 * NeoForge Maven metadata.
 * 版番号プレフィックスは MC 1.x.y → x.y （例: 1.21.1 → 21.1.）
 */
export class NeoForgeProvider implements LoaderVersionProvider {
  readonly id = 'neoforge' as const

  private readonly metadataUrl =
    'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml'

  async fetchLoaderVersions(minecraftVersion: string): Promise<LoaderVersion[]> {
    const prefix = neoForgePrefix(minecraftVersion)
    if (!prefix) return []

    const res = await fetch(this.metadataUrl, {
      headers: { 'User-Agent': 'Fledge/0.1.1 (neoforge-versions)' },
    })
    if (!res.ok) throw new Error(`NeoForge metadata HTTP ${res.status}`)
    const xml = await res.text()
    const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]!)
    const matched = versions.filter((v) => v.startsWith(prefix)).reverse()
    return matched.map((v) => ({
      id: v,
      version: v,
      stable: !/-beta/i.test(v),
    }))
  }
}

/** 1.21.1 → "21.1." / 1.20.1 → "20.1." */
export function neoForgePrefix(minecraftVersion: string): string | null {
  const m = /^1\.(\d+)\.(\d+)(?:$|-)/.exec(minecraftVersion)
  if (m) return `${m[1]}.${m[2]}.`
  const m2 = /^1\.(\d+)$/.exec(minecraftVersion)
  if (m2) return `${m2[1]}.0.`
  return null
}
