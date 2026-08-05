import type { ContentProject } from '@fledge/shared'

/** クロスプラットフォームで同一プロジェクトとみなすキー */
export function normalizeContentIdentity(p: ContentProject): string {
  const slug = p.slug.toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (slug.length >= 2) return `slug:${slug}`
  const name = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '')
  return `name:${name}`
}

/**
 * CurseForge を土台に載せ、同一キーは Modrinth で上書き（Modrinth 優先）。
 * 片方にしか無いものはそのまま残る。
 */
export function mergePreferModrinth(
  modrinthHits: ContentProject[],
  curseforgeHits: ContentProject[],
): ContentProject[] {
  const map = new Map<string, ContentProject>()
  for (const hit of curseforgeHits) {
    map.set(normalizeContentIdentity(hit), hit)
  }
  for (const hit of modrinthHits) {
    map.set(normalizeContentIdentity(hit), hit)
  }
  return [...map.values()].sort((a, b) => b.downloads - a.downloads)
}
