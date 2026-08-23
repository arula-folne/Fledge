import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fledgeApi } from '../../api/fledgeApi'
import { loadSessionQuery, sessionQueryOptions } from '../auth/sessionCache'
import { Button } from '../../components/ui/Button'
import { formatProgressMessage } from './formatProgressMessage'
import { useLaunchStore, useUiStore } from '../../stores/appStores'

export function PlayPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const authStatus = useUiStore((s) => s.authStatus)
  const setWizardOpen = useUiStore((s) => s.setInstanceWizardOpen)
  const byProfileId = useLaunchStore((s) => s.byProfileId)
  const stateFor = useLaunchStore((s) => s.stateFor)
  const phaseMessageKey = useLaunchStore((s) => s.phaseMessageKey)
  const progress = useLaunchStore((s) => s.progress)
  const errorMessageKey = useLaunchStore((s) => s.errorMessageKey)

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => fledgeApi.settings.get(),
  })
  const instancesQuery = useQuery({
    queryKey: ['instances'],
    queryFn: () => fledgeApi.instances.list(),
  })
  const pathsQuery = useQuery({
    queryKey: ['paths'],
    queryFn: () => fledgeApi.paths.get(),
  })
  const setAuthStatus = useUiStore((s) => s.setAuthStatus)
  const sessionQuery = useQuery({
    queryKey: ['session'],
    ...sessionQueryOptions,
    queryFn: () => loadSessionQuery(queryClient),
  })

  const selectedId = settingsQuery.data?.selectedInstanceId ?? ''
  const instances = instancesQuery.data ?? []
  const state = stateFor(selectedId)
  const session = selectedId ? byProfileId[selectedId] : undefined
  const runningCount = Object.values(byProfileId).filter((s) => s.state === 'running').length
  const activeAccount = sessionQuery.data?.account

  const canPlay =
    Boolean(selectedId) &&
    (authStatus === 'logged_in' || authStatus === 'refreshing') &&
    state !== 'preparing' &&
    state !== 'launching' &&
    state !== 'running'

  const onSelect = async (id: string) => {
    await fledgeApi.settings.set({ selectedInstanceId: id })
    await queryClient.invalidateQueries({ queryKey: ['settings'] })
  }

  const onPlay = async () => {
    if (!selectedId) return
    try {
      await fledgeApi.launch.start(selectedId)
    } catch {
      // 状態イベントで error が来る
    }
  }

  const percent =
    progress?.percent ??
    (progress && progress.total > 0 ? (progress.current / progress.total) * 100 : 0)

  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-[var(--color-text)]">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--color-text-muted)]">{t('home.selectInstance')}</span>
          <select
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-base outline-none focus:border-[var(--color-accent)]"
            value={selectedId}
            onChange={(e) => void onSelect(e.target.value)}
          >
            <option value="">{t('home.noInstance')}</option>
            {instances.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.loader} {i.minecraftVersion})
              </option>
            ))}
          </select>
        </label>

        {activeAccount ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            {t('home.launchAs', { name: activeAccount.displayName })}
          </p>
        ) : null}
        {runningCount > 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            {t('home.runningCount', { count: runningCount })}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {state === 'preparing' || state === 'launching' ? (
            <Button
              variant="secondary"
              onClick={() => void fledgeApi.launch.cancel(session?.sessionId)}
            >
              {t('home.cancel')}
            </Button>
          ) : state === 'running' ? (
            <Button
              variant="danger"
              onClick={() => void fledgeApi.launch.kill(session?.sessionId)}
            >
              {t('home.killGame')}
            </Button>
          ) : authStatus === 'logged_out' || authStatus === 'expired' ? (
            <Button
              variant="success"
              onClick={() => {
                setAuthStatus('logging_in')
                void queryClient.cancelQueries({ queryKey: ['session'] })
                void fledgeApi.auth.login()
              }}
            >
              {t('auth.login')}
            </Button>
          ) : (
            <Button
              variant="primary"
              className="min-w-40 px-8 py-3 text-base"
              disabled={!canPlay}
              onClick={() => void onPlay()}
            >
              {t('home.play')}
            </Button>
          )}
          <Link to="/logs" className="text-sm text-[var(--color-accent)] hover:underline">
            {t('common.openLogs')}
          </Link>
        </div>

        {(state === 'preparing' || state === 'launching' || state === 'running') && (
          <div className="space-y-2">
            <div className="text-sm text-[var(--color-text-muted)]">
              {formatProgressMessage(t, progress?.messageKey ?? phaseMessageKey, progress?.meta)}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--color-accent-soft)]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-150"
                style={{ width: `${Math.min(100, Math.max(4, percent))}%` }}
              />
            </div>
          </div>
        )}

        {errorMessageKey ? (
          <div className="rounded-[var(--radius-sm)] bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]">
            {t(errorMessageKey)}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-4">
          <Button type="button" variant="secondary" onClick={() => setWizardOpen(true)}>
            {t('home.quickCreate')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={!pathsQuery.data}
            onClick={() => pathsQuery.data && void fledgeApi.paths.open(pathsQuery.data.instances)}
          >
            {t('home.quickOpenInstances')}
          </Button>
        </div>
      </div>
    </section>
  )
}
