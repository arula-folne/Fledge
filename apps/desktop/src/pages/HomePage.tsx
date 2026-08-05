import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fledgeApi } from '../api/fledgeApi'
import { NewsList } from '../features/news/NewsList'
import { InstanceCard } from '../features/instances/InstanceCard'
import { Button } from '../components/ui/Button'
import { useLaunchStore } from '../stores/appStores'

export default function HomePage() {
  const { t } = useTranslation()
  const byProfileId = useLaunchStore((s) => s.byProfileId)
  const runningCount = Object.values(byProfileId).filter((s) => s.state === 'running').length

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => fledgeApi.settings.get(),
  })
  const instancesQuery = useQuery({
    queryKey: ['instances'],
    queryFn: () => fledgeApi.instances.list(),
  })

  const lastId =
    settingsQuery.data?.lastPlayedInstanceId ?? settingsQuery.data?.selectedInstanceId ?? null
  const lastInstance = instancesQuery.data?.find((i) => i.id === lastId) ?? null

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <section>
        <p className="mb-1 text-xs tracking-wide text-[var(--color-text-muted)]">{t('app.tagline')}</p>
        <h2 className="mb-4 text-sm font-medium text-[var(--color-text-muted)]">
          {t('home.lastPlayed')}
        </h2>

        {lastInstance ? (
          <div className="space-y-3">
            <InstanceCard instance={lastInstance} variant="hero" />
            {runningCount > 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">
                {t('home.runningCount', { count: runningCount })}
              </p>
            ) : null}
            <Link to="/library" className="text-sm text-[var(--color-accent)] hover:underline">
              {t('home.goLibrary')}
            </Link>
          </div>
        ) : (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/60 px-6 py-10 text-center">
            <p className="text-[var(--color-text-muted)]">{t('home.noLastPlayed')}</p>
            <Link to="/library" className="mt-4 inline-block">
              <Button variant="primary">{t('home.goLibrary')}</Button>
            </Link>
          </div>
        )}
      </section>

      <NewsList />
    </div>
  )
}
