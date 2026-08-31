import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { IconPlus } from '@tabler/icons-react'
import { fledgeApi } from '../api/fledgeApi'
import { Button } from '../components/ui/Button'
import { NewsList } from '../features/news/NewsList'
import { InstanceCard } from '../features/instances/InstanceCard'
import { HomeLibrarySection } from '../features/instances/HomeLibrarySection'
import { useLaunchStore, useUiStore } from '../stores/appStores'

export default function HomePage() {
  const { t } = useTranslation()
  const setWizardOpen = useUiStore((s) => s.setInstanceWizardOpen)
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
        {featured ? (
          <section className="min-w-0 shrink-0">
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-[var(--color-text-muted)]">
                {t('home.lastPlayed')}
              </h2>
              <InstanceCard instance={featured} variant="hero" />
              {runningCount > 0 ? (
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t('home.runningCount', { count: runningCount })}
                </p>
              ) : null}
              <div className="flex justify-end pt-0.5">
                <Button
                  data-fledge-tutorial="tutorial-home-create"
                  variant="secondary"
                  onClick={() => setWizardOpen(true)}
                >
                  <IconPlus size={16} stroke={1.75} />
                  {t('library.create')}
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        <HomeLibrarySection instances={instances} showCreateButton={!featured} />
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden lg:h-full">
        <NewsList compact />
      </div>
    </div>
  )
}
