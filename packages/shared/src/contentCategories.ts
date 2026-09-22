import type { ContentCategory, Loader } from './models.js'

/**
 * インスタンスへ追加できるコンテンツ種別。
 * プラグインはサーバー向けのため対象外。
 */
export const INSTANCE_CONTENT_CATEGORIES: readonly ContentCategory[] = [
  'mod',
  'resourcepack',
  'shader',
  'datapack',
] as const

/** ローダーに応じて、インスタンスへ追加可能なコンテンツ種別を返す。 */
export function contentCategoriesForLoader(loader: Loader): ContentCategory[] {
  if (loader === 'vanilla') {
    return ['resourcepack', 'datapack']
  }
  return [...INSTANCE_CONTENT_CATEGORIES]
}

/** Vanilla では使えない（Mod / シェーダー）かどうか。 */
export function isVanillaBlockedCategory(category: ContentCategory): boolean {
  return category === 'mod' || category === 'shader'
}

/**
 * インスタンスへのインストール可否。
 * UI と Core の両方で同じ判定を使う。
 */
export function contentInstallBlockReason(
  loader: Loader,
  category: ContentCategory,
): string | null {
  if (category === 'plugin') return 'content.error.pluginUnsupported'
  if (category === 'modpack') return 'content.error.modpackUseCreate'
  if (loader === 'vanilla' && isVanillaBlockedCategory(category)) {
    return 'content.error.vanillaCategoryUnsupported'
  }
  if (!contentCategoriesForLoader(loader).includes(category)) {
    return 'content.error.categoryUnsupported'
  }
  return null
}
