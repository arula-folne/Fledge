import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useEffect, useId, useRef, useState } from 'react'
import { fledgeApi } from '../../api/fledgeApi'
import { applyLoggedInAccount, loadSessionQuery, sessionQueryOptions } from './sessionCache'
import { startLogin } from './loginAction'
import { useUiStore } from '../../stores/appStores'
import { Button } from '../../components/ui/Button'
import { McFaceAvatar } from './McFaceAvatar'
import { mcFaceUrl } from './mcFace'

export function AccountChip() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const authStatus = useUiStore((s) => s.authStatus)
  const setAuthStatus = useUiStore((s) => s.setAuthStatus)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  const sessionQuery = useQuery({
    queryKey: ['session'],
    ...sessionQueryOptions,
    queryFn: async () => {
      const result = await loadSessionQuery(queryClient)
      if (useUiStore.getState().authStatus !== 'logging_in') {
        setAuthStatus(result.status)
      }
      return result
    },
  })

  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: () => fledgeApi.auth.list(),
  })

  const switchMutation = useMutation({
    mutationFn: (id: string) => fledgeApi.auth.switch(id),
    onSuccess: (account) => {
      applyLoggedInAccount(queryClient, account)
    },
  })

  const logoutMutation = useMutation({
    mutationFn: (id?: string) => fledgeApi.auth.logout(id),
    onSuccess: () => {
      setOpen(false)
    },
  })

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const account = sessionQuery.data?.account
  const accounts = accountsQuery.data ?? []
  const faceUrl = mcFaceUrl(account, 32)
  const popupFaceUrl = mcFaceUrl(account, 48)
  const secondaryLine =
    authStatus === 'expired' ? (
      <div className="text-xs leading-tight text-[var(--color-danger)]">{t('auth.reloginRequired')}</div>
    ) : accounts.length > 1 ? (
      <div className="text-xs leading-tight text-[var(--color-text-muted)]">
        {t('auth.accountCount', { count: accounts.length })}
      </div>
    ) : null

  const chipLabel =
    authStatus === 'logging_in'
      ? t('auth.status.loggingIn')
      : authStatus === 'refreshing'
        ? t('auth.status.refreshing')
        : authStatus === 'expired'
          ? t('auth.status.expired')
          : account
            ? account.displayName
            : t('auth.status.loggedOut')

  const statusText =
    authStatus === 'logging_in'
      ? t('auth.status.loggingIn')
      : authStatus === 'refreshing'
        ? t('auth.status.refreshing')
        : authStatus === 'expired'
          ? t('auth.status.expired')
          : account
            ? t('auth.status.loggedIn')
            : t('auth.status.loggedOut')

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="flex items-center gap-2 rounded-[var(--radius-sm)] px-1 py-0.5 text-left transition hover:bg-[var(--color-hover)]"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex h-8 min-w-0 flex-col justify-center text-right text-sm">
          <div className="truncate font-medium leading-none text-[var(--color-text)]">{chipLabel}</div>
          {secondaryLine}
        </div>
        {faceUrl ? (
          <McFaceAvatar src={faceUrl} size={32} />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-accent-soft)] text-xs text-[var(--color-text-muted)]">
            {(account?.displayName ?? '?').slice(0, 1)}
          </div>
        )}
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={t('settings.account')}
          className="absolute right-0 top-[calc(100%+8px)] z-[100] w-72 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg"
        >
          <div className="flex items-center gap-3">
            {popupFaceUrl ? (
              <McFaceAvatar src={popupFaceUrl} size={48} radius="md" />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-accent-soft)] text-sm font-semibold text-[var(--color-text)]">
                {(account?.displayName ?? '?').slice(0, 1)}
              </div>
            )}
            <div className="min-w-0 space-y-1">
              <p className="truncate text-sm font-semibold text-[var(--color-text)]">
                {account?.displayName ?? t('auth.status.loggedOut')}
              </p>
              <p
                className={[
                  'text-xs',
                  authStatus === 'expired' ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-muted)]',
                ].join(' ')}
              >
                {statusText}
              </p>
            </div>
          </div>

          {accounts.length > 0 ? (
            <div className="mt-3 space-y-1 border-t border-[var(--color-border)] pt-3">
              <p className="mb-1 text-[11px] text-[var(--color-text-muted)]">{t('auth.savedAccounts')}</p>
              <ul className="max-h-40 space-y-1 overflow-auto">
                {accounts.map((a) => {
                  const active = a.id === account?.id
                  const aFace = mcFaceUrl(a, 28)
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        disabled={active || switchMutation.isPending}
                        className={[
                          'flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm transition',
                          active
                            ? 'bg-[var(--color-selection-soft)] text-[var(--color-selection)]'
                            : 'hover:bg-[var(--color-hover)] text-[var(--color-text)]',
                        ].join(' ')}
                        onClick={() => switchMutation.mutate(a.id)}
                      >
                        {aFace ? (
                          <McFaceAvatar src={aFace} size={28} className="bg-[var(--color-bg)]" />
                        ) : (
                          <span className="h-7 w-7 shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)]" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{a.displayName}</span>
                        {active ? (
                          <span className="text-[10px] font-semibold">{t('auth.active')}</span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          <div className="mt-3 flex flex-col gap-2">
            <Button
              variant="primary"
              className="w-full"
              disabled={authStatus === 'logging_in'}
              onClick={() => void startLogin(queryClient)}
            >
              {t('auth.addAccount')}
            </Button>
            {account ? (
              <Button
                variant="secondary"
                className="w-full"
                disabled={logoutMutation.isPending}
                onClick={() => logoutMutation.mutate(account.id)}
              >
                {t('auth.logout')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
