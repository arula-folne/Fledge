import type { ContentLoaderFilter, Loader } from './models.js'

/** インスタンスのローダー種別を Modrinth 検索フィルターに変換する。 */
export function loaderToContentFilters(loader: Loader): ContentLoaderFilter[] {
  switch (loader) {
    case 'fabric':
      return ['fabric']
    case 'forge':
      return ['forge']
    case 'neoforge':
      return ['neoforge']
    case 'quilt':
      return ['quilt']
    default:
      return []
  }
}
