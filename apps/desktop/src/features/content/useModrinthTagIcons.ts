import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ContentCategory } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'

const PROJECT_TYPE: Record<ContentCategory, string> = {
  mod: 'mod',
  modpack: 'modpack',
  resourcepack: 'resourcepack',
  shader: 'shader',
  datapack: 'datapack',
  plugin: 'plugin',
}

export function useModrinthTagIcons(category: ContentCategory | 'all') {
  const query = useQuery({
    queryKey: ['modrinth-category-tags'],
    queryFn: () => fledgeApi.content.listCategoryTags(),
    staleTime: 1000 * 60 * 60 * 24,
  })

  const iconByTag = useMemo(() => {
    const map = new Map<string, string>()
    const projectType = category === 'all' ? null : PROJECT_TYPE[category]
    for (const tag of query.data ?? []) {
      if (tag.icon && (!projectType || tag.projectType === projectType)) {
        map.set(tag.name, tag.icon)
      }
    }
    return map
  }, [query.data, category])

  return iconByTag
}
