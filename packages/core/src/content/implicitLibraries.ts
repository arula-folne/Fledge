import type { ContentCategory, Loader } from '@fledge/shared'

export type ImplicitLibrary = {
  projectId: string
  slug: string
}

/** ローダーごとに mod 導入時に自動で入れるライブラリ（Modrinth が required 未宣言でも必要なもの） */
const IMPLICIT_LIBRARIES: Partial<Record<Loader, ImplicitLibrary[]>> = {
  fabric: [{ projectId: 'P7dR8mSH', slug: 'fabric-api' }],
  quilt: [{ projectId: 'qvIfYCYJ', slug: 'qsl' }],
}

export function implicitLibrariesForLoader(
  loader: Loader | undefined,
  category: ContentCategory,
): ImplicitLibrary[] {
  if (!loader || category !== 'mod') return []
  return IMPLICIT_LIBRARIES[loader] ?? []
}

export function isImplicitLibraryTarget(projectRef: string, lib: ImplicitLibrary): boolean {
  const ref = projectRef.trim().toLowerCase()
  return ref === lib.projectId.toLowerCase() || ref === lib.slug.toLowerCase()
}
