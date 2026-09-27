import type { ContentCategory, InstalledContent } from '@fledge/shared'

const PROJECT_PATH: Record<ContentCategory, string> = {
  mod: 'mod',
  modpack: 'modpack',
  resourcepack: 'resourcepack',
  shader: 'shader',
  datapack: 'datapack',
  plugin: 'plugin',
}

export type ContentShareFormat = 'names' | 'links' | 'fileNames'

/** Modrinth App と同様: プロジェクト名・リンク・ファイル名 */
export function buildContentShareText(
  items: InstalledContent[],
  format: ContentShareFormat,
): string {
  switch (format) {
    case 'names':
      return items.map((item) => item.name || item.fileName).join('\n')
    case 'fileNames':
      return items.map((item) => item.fileName).filter(Boolean).join('\n')
    case 'links':
      return items
        .filter((item) => item.provider === 'modrinth' && item.slug)
        .map((item) => `https://modrinth.com/${PROJECT_PATH[item.category]}/${item.slug}`)
        .join('\n')
    default:
      return ''
  }
}
