type Segment = {
  num: number
  /** 英字サフィックス。空文字は正式版（どの英字よりも新しい扱い） */
  suffix: string
}

/** 先頭の `v` / `Ver.` を除き、`.` と `-` で分割する */
function parseSegments(version: string): Segment[] {
  const normalized = version.trim().replace(/^ver\./i, '').replace(/^v/i, '')
  const segments: Segment[] = []
  for (const part of normalized.split(/[.-]/)) {
    const m = /^(\d*)([a-z]*)$/i.exec(part)
    const num = m?.[1] ? Number.parseInt(m[1], 10) : 0
    const suffix = (m?.[2] ?? '').toLowerCase()
    const prev = segments[segments.length - 1]
    // 純英字パート（0.1.4-a / 0.1.4-alpha）は直前の数値のサフィックスとして扱い、
    // 0.1.4a と同一視する
    if (m && !m[1] && suffix && prev && prev.suffix === '') {
      prev.suffix = suffix
      continue
    }
    segments.push({ num, suffix })
  }
  return segments
}

/** 後方互換用: 数値セグメントのみを返す */
export function parseVersionSegments(version: string): number[] {
  return parseSegments(version).map((s) => s.num)
}

/**
 * a が b より古いとき -1、同じ 0、新しいとき 1。
 * `0.1.4a` のような英字サフィックスはプレリリース扱い（0.1.4a < 0.1.4b < 0.1.4）。
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseSegments(a)
  const pb = parseSegments(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? { num: 0, suffix: '' }
    const db = pb[i] ?? { num: 0, suffix: '' }
    if (da.num < db.num) return -1
    if (da.num > db.num) return 1
    if (da.suffix !== db.suffix) {
      // サフィックスなし（正式版）が最も新しい
      if (da.suffix === '') return 1
      if (db.suffix === '') return -1
      return da.suffix < db.suffix ? -1 : 1
    }
  }
  return 0
}

export function normalizeReleaseVersion(tag: string): string {
  return tag.trim().replace(/^v/i, '')
}
