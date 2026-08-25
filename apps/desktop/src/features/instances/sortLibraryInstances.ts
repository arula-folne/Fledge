import type { InstanceProfile, LibrarySortMode } from '@fledge/shared'
import { reconcileLibraryInstanceOrder } from '@fledge/shared'

function byNameAsc(a: InstanceProfile, b: InstanceProfile): number {
  return a.name.localeCompare(b.name, 'ja')
}

function byLastPlayedDesc(a: InstanceProfile, b: InstanceProfile): number {
  const at = a.lastPlayedAt ? Date.parse(a.lastPlayedAt) : 0
  const bt = b.lastPlayedAt ? Date.parse(b.lastPlayedAt) : 0
  if (bt !== at) return bt - at
  return byNameAsc(a, b)
}

function byCreatedDesc(a: InstanceProfile, b: InstanceProfile): number {
  const at = a.createdAt ? Date.parse(a.createdAt) : 0
  const bt = b.createdAt ? Date.parse(b.createdAt) : 0
  if (bt !== at) return bt - at
  return byNameAsc(a, b)
}

/** ライブラリ一覧の並び。manual 時は order のインデックス順 */
export function sortLibraryInstances(
  items: InstanceProfile[],
  mode: LibrarySortMode,
  order: readonly string[] = [],
): InstanceProfile[] {
  if (items.length <= 1) return items

  if (mode === 'manual') {
    const reconciled = reconcileLibraryInstanceOrder([...order], items.map((i) => i.id))
    const index = new Map(reconciled.map((id, i) => [id, i]))
    return [...items].sort((a, b) => {
      const ai = index.get(a.id) ?? Number.MAX_SAFE_INTEGER
      const bi = index.get(b.id) ?? Number.MAX_SAFE_INTEGER
      if (ai !== bi) return ai - bi
      return byNameAsc(a, b)
    })
  }

  if (mode === 'name') return [...items].sort(byNameAsc)
  if (mode === 'nameDesc') return [...items].sort((a, b) => byNameAsc(b, a))
  if (mode === 'created') return [...items].sort(byCreatedDesc)
  return [...items].sort(byLastPlayedDesc)
}
