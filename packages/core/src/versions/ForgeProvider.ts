import { getForgeVersionList } from '@xmcl/installer'
import { fledgeUserAgent, type LoaderVersion } from '@fledge/shared'
import type { LoaderVersionProvider } from './VersionProvider.js'

const FORGE_METADATA =
  'https://files.minecraftforge.net/maven/net/minecraftforge/forge/maven-metadata.json'

/** Forge 公式メタデータ（files.minecraftforge.net / maven） */
export class ForgeProvider implements LoaderVersionProvider {
  readonly id = 'forge' as const

  async fetchLoaderVersions(minecraftVersion: string): Promise<LoaderVersion[]> {
    const list = await getForgeVersionList({ minecraft: minecraftVersion })
    return (list.versions ?? []).map((v) => ({
      id: v.version,
      version: v.version,
      recommended: v.type === 'recommended',
      stable: v.type === 'recommended',
      type: v.type,
    }))
  }

  async fetchGameVersions(): Promise<string[]> {
    const res = await fetch(FORGE_METADATA, {
      headers: { 'User-Agent': fledgeUserAgent('forge-versions') },
    })
    if (!res.ok) throw new Error(`Forge metadata HTTP ${res.status}`)
    const metadata = await res.json()
    const versions = extractForgeGameVersions(metadata)
    versions.sort(compareMcDesc)
    return versions
  }
}

function extractForgeGameVersions(metadata: unknown): string[] {
  if (Array.isArray(metadata)) {
    const seen = new Set<string>()
    for (const v of metadata) {
      if (typeof v !== 'string') continue
      const mc = v.split('-')[0]
      if (mc) seen.add(mc)
    }
    return [...seen]
  }
  if (!metadata || typeof metadata !== 'object') return []
  const root = metadata as Record<string, unknown>
  const out: string[] = []

  for (const [key, value] of Object.entries(root)) {
    if (key === 'versions' || key === 'number') continue
    if (Array.isArray(value) && value.length > 0) out.push(key)
  }
  if (out.length) return out

  for (const nestKey of ['versions', 'number'] as const) {
    const nested = root[nestKey]
    if (!nested || typeof nested !== 'object') continue
    for (const [key, value] of Object.entries(nested as Record<string, unknown>)) {
      if (Array.isArray(value) && value.length > 0) out.push(key)
    }
    if (out.length) return out
  }
  return out
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
