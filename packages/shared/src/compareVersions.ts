/** 先頭の `v` / `Ver.` を除き、数値セグメントに分解する */
export function parseVersionSegments(version: string): number[] {
  const normalized = version.trim().replace(/^ver\./i, '').replace(/^v/i, '')
  return normalized.split(/[.-]/).map((part) => {
    const n = Number.parseInt(part, 10)
    return Number.isFinite(n) ? n : 0
  })
}

/** a が b より古いとき -1、同じ 0、新しいとき 1 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseVersionSegments(a)
  const pb = parseVersionSegments(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da < db) return -1
    if (da > db) return 1
  }
  return 0
}

export function normalizeReleaseVersion(tag: string): string {
  return tag.trim().replace(/^v/i, '')
}
