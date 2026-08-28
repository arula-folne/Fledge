import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ContentProject } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'

export function useContentFavorites() {
  const queryClient = useQueryClient()
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => fledgeApi.settings.get(),
  })

  const favorites = settingsQuery.data?.contentFavorites ?? []
  const favoriteIds = useMemo(
    () => new Set(favorites.map((entry) => entry.projectId)),
    [favorites],
  )

  const toggleMutation = useMutation({
    mutationFn: async (project: ContentProject) => {
      const current = await fledgeApi.settings.get()
      const exists = current.contentFavorites.some((entry) => entry.projectId === project.id)
      const contentFavorites = exists
        ? current.contentFavorites.filter((entry) => entry.projectId !== project.id)
        : [
            {
              projectId: project.id,
              provider: project.provider,
              savedAt: new Date().toISOString(),
              project,
            },
            ...current.contentFavorites,
          ]
      return fledgeApi.settings.set({ contentFavorites })
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(['settings'], settings)
    },
  })

  const isFavorite = useCallback((projectId: string) => favoriteIds.has(projectId), [favoriteIds])

  const toggleFavorite = useCallback(
    (project: ContentProject) => {
      toggleMutation.mutate(project)
    },
    [toggleMutation],
  )

  return {
    favorites,
    isFavorite,
    toggleFavorite,
    togglePending: toggleMutation.isPending,
  }
}
