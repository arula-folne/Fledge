/** Modrinth 風: 安定版を優先し、無ければ beta → alpha へフォールバック */

export type ContentVersionChannel = 'release' | 'beta' | 'alpha' | string

export type ContentVersionPickable = {
  id: string
  versionType?: ContentVersionChannel | null
}

const CHANNEL_ORDER = ['release', 'beta', 'alpha'] as const

function contentVersionChannelRank(versionType?: string | null): number {
  const t = (versionType ?? 'release').toLowerCase()
  const idx = CHANNEL_ORDER.indexOf(t as (typeof CHANNEL_ORDER)[number])
  return idx >= 0 ? idx : CHANNEL_ORDER.length
}

/** 互換バージョン配列（新しい順想定）から優先版を1つ選ぶ */
export function pickPreferredContentVersion<T extends ContentVersionPickable>(
  versions: readonly T[],
): T | undefined {
  if (versions.length === 0) return undefined
  for (const channel of CHANNEL_ORDER) {
    const hit = versions.find((v) => contentVersionChannelRank(v.versionType) === contentVersionChannelRank(channel))
    if (hit) return hit
  }
  return versions[0]
}
