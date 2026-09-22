import { fledgeUserAgent, type LoaderVersion } from '@fledge/shared'
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

    const versions = await this.fetchAllVersions()
    const matched = versions.filter((v) => v.startsWith(prefix)).reverse()
    return matched.map((v) => ({
      id: v,
      version: v,
      stable: !/-beta/i.test(v),
    }))
  }

  async fetchGameVersions(): Promise<string[]> {
    const versions = await this.fetchAllVersions()
    const prefixes = new Set<string>()
    for (const v of versions) {
      const core = v.split('-')[0] ?? v
      const parts = core.split('.')
      if (parts.length >= 2) {
        prefixes.add(`${parts[0]}.${parts[1]}.`)
      }
    }
    const seen = new Set<string>()
    for (const p of prefixes) {
      for (const id of prefixToMinecraftIds(p)) seen.add(id)
    }
    return [...seen].sort(compareMcDesc)
  }

  private async fetchAllVersions(): Promise<string[]> {
    const res = await fetch(this.metadataUrl, {
      headers: { 'User-Agent': fledgeUserAgent('neoforge-versions') },
    })
    if (!res.ok) throw new Error(`NeoForge metadata HTTP ${res.status}`)
    const xml = await res.text()
    return [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]!)
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

function prefixToMinecraftIds(prefix: string): string[] {
  const trimmed = prefix.replace(/\.$/, '')
  const parts = trimmed.split('.')
  if (parts.length === 2) {
    const [minor, patch] = parts
    if (patch === '0') return [`1.${minor}`, `1.${minor}.0`]
    return [`1.${minor}.${patch}`]
  }
  if (parts.length === 1) return [`1.${parts[0]}`]
  return []
}

function compareMcDesc(a: string, b: string): number {
  const pa = a.split('.').map((p) => Number.parseInt(p, 10) || 0)
  const pb = b.split('.').map((p) => Number.parseInt(p, 10) || 0)
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}
