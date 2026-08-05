import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useEffect, useId, useRef, useState } from 'react'
import { fledgeApi } from '../../api/fledgeApi'
import { useUiStore } from '../../stores/appStores'
import { Button } from '../../components/ui/Button'

function faceOf(account: { avatarUrl?: string; uuid: string; displayName: string } | null | undefined) {
  if (!account) return null
  return (
    account.avatarUrl ??
    (account.uuid ? `https://mc-heads.net/avatar/${account.uuid.replaceAll('-', '')}/64` : null)
  )
}

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
    queryFn: async () => {
      const result = await fledgeApi.auth.session()
      setAuthStatus(result.status)
      return result
    },
  })

  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: () => fledgeApi.auth.list(),
  })

  const loginMutation = useMutation({
    mutationFn: () => fledgeApi.auth.login(),
    onMutate: () => setAuthStatus('logging_in'),
    onSuccess: async () => {
      setAuthStatus('logged_in')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['session'] }),
        queryClient.invalidateQueries({ queryKey: ['accounts'] }),
      ])
    },
    onError: () => setAuthStatus('logged_out'),
  })

  const switchMutation = useMutation({
    mutationFn: (id: string) => fledgeApi.auth.switch(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['session'] }),
        queryClient.invalidateQueries({ queryKey: ['accounts'] }),
      ])
    },
  })

  const logoutMutation = useMutation({
    mutationFn: (id?: string) => fledgeApi.auth.logout(id),
    onSuccess: async () => {
      setOpen(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['session'] }),
        queryClient.invalidateQueries({ queryKey: ['accounts'] }),
      ])
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
  const faceUrl = faceOf(account)

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
        className="flex items-center gap-3 rounded-[var(--radius-sm)] px-1.5 py-1 text-left transition hover:bg-[var(--color-hover)]"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="text-right text-sm">
          <div className="font-medium text-[var(--color-text)]">{chipLabel}</div>
          {authStatus === 'expired' ? (
            <div className="text-xs text-[var(--color-danger)]">{t('auth.reloginRequired')}</div>
          ) : accounts.length > 1 ? (
            <div className="text-xs text-[var(--color-text-muted)]">
              {t('auth.accountCount', { count: accounts.length })}
            </div>
          ) : null}
        </div>
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-accent-soft)]">
          {faceUrl ? (
            <img
              src={faceUrl}
              alt=""
              className="h-full w-full"
              style={{ imageRendering: 'pixelated' }}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-white/90">
              {(account?.displayName ?? '?').slice(0, 1)}
            </div>
          )}
        </div>
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={t('settings.account')}
          className="absolute right-0 top-[calc(100%+8px)] z-[100] w-72 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg"
        >
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-accent-soft)]">
              {faceUrl ? (
                <img
                  src={faceUrl}
                  alt=""
                  className="h-full w-full"
                  style={{ imageRendering: 'pixelated' }}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-[var(--color-text)]">
                  {(account?.displayName ?? '?').slice(0, 1)}
                </div>
              )}
            </div>
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
                  const aFace = faceOf(a)
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        disabled={active || switchMutation.isPending}
                        className={[
                          'flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm transition',
                          active
                            ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                            : 'hover:bg-[var(--color-hover)] text-[var(--color-text)]',
                        ].join(' ')}
                        onClick={() => switchMutation.mutate(a.id)}
                      >
                        <span className="h-7 w-7 shrink-0 overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-bg)]">
                          {aFace ? (
                            <img
                              src={aFace}
                              alt=""
                              className="h-full w-full"
                              style={{ imageRendering: 'pixelated' }}
                              referrerPolicy="no-referrer"
                            />
                          ) : null}
                        </span>
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
              disabled={loginMutation.isPending || authStatus === 'logging_in'}
              onClick={() => loginMutation.mutate()}
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
