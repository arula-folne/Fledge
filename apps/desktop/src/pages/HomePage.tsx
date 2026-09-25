import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { IconChevronLeft } from '@tabler/icons-react'
import { fledgeApi } from '../api/fledgeApi'
import { HoverTip } from '../components/ui/HoverTip'
import { NewsList } from '../features/news/NewsList'
import { HomeLibrarySection } from '../features/instances/HomeLibrarySection'

export default function HomePage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const instancesQuery = useQuery({
    queryKey: ['instances'],
    queryFn: () => fledgeApi.instances.list(),
  })
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => fledgeApi.settings.get(),
  })

  const showNews = settingsQuery.data?.homeNewsVisible ?? true

  const showNewsMutation = useMutation({
    mutationFn: () => fledgeApi.settings.set({ homeNewsVisible: true }),
    onSuccess: async (next) => {
      queryClient.setQueryData(['settings'], next)
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const instances = instancesQuery.data ?? []

  return (
    <div
      className={[
        'flex h-full min-h-0 flex-col gap-[var(--home-gap)] overflow-hidden',
        showNews
          ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_var(--home-news-col)] lg:grid-rows-[minmax(0,1fr)]'
          : 'lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:grid-rows-[minmax(0,1fr)]',
      ].join(' ')}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:h-full">
        <HomeLibrarySection instances={instances} newsMinimized={!showNews} />
      </div>

      {showNews ? (
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden lg:h-full">
          <NewsList compact showMinimize />
        </div>
      ) : (
        <div className="flex shrink-0 justify-end lg:h-full lg:w-full lg:flex-col lg:items-end lg:justify-start">
          <HoverTip label={t('news.show')}>
            <button
              type="button"
              className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[var(--color-accent)]/70 transition hover:bg-[var(--color-accent)]/12 hover:text-[var(--color-accent)]"
              aria-label={t('news.show')}
              disabled={showNewsMutation.isPending}
              onClick={() => showNewsMutation.mutate()}
            >
              <IconChevronLeft
                size={20}
                stroke={1.75}
                className="rotate-[-90deg] lg:rotate-0"
                aria-hidden
              />
            </button>
          </HoverTip>
        </div>
      )}
    </div>
  )
}
