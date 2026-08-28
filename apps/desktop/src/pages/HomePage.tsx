import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fledgeApi } from '../api/fledgeApi'
import { NewsList } from '../features/news/NewsList'
import { InstanceCard } from '../features/instances/InstanceCard'
import { HomeLibrarySection } from '../features/instances/HomeLibrarySection'
import { useLaunchStore } from '../stores/appStores'

export default function HomePage() {
  const { t } = useTranslation()
  const runningCount = useLaunchStore(
    (s) => Object.values(s.byProfileId).filter((x) => x.state === 'running').length,
  )

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => fledgeApi.settings.get(),
  })
  const instancesQuery = useQuery({
    queryKey: ['instances'],
    queryFn: () => fledgeApi.instances.list(),
  })

  const instances = instancesQuery.data ?? []
  const featuredId =
    settingsQuery.data?.lastPlayedInstanceId ?? settingsQuery.data?.selectedInstanceId ?? null
  const featured = instances.find((i) => i.id === featuredId) ?? instances[0] ?? null

  return (
    <div className="flex h-full min-h-0 flex-col gap-[var(--home-gap)] overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_var(--home-news-col)] lg:grid-rows-[minmax(0,1fr)]">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-[var(--home-main-gap)] overflow-hidden lg:h-full">
        <section className="min-w-0 shrink-0">
          {featured ? (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-[var(--color-text-muted)]">{t('home.lastPlayed')}</h2>
              <InstanceCard instance={featured} variant="hero" />
              {runningCount > 0 ? (
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t('home.runningCount', { count: runningCount })}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <HomeLibrarySection instances={instances} />
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden lg:h-full">
        <NewsList compact />
      </div>
    </div>
  )
}
