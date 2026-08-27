import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useEffect, useId, useRef, useState } from 'react'
import { IconUser } from '@tabler/icons-react'
import { fledgeApi } from '../../api/fledgeApi'
import { applyLoggedInAccount, loadSessionQuery, sessionQueryOptions } from './sessionCache'
import { startLogin } from './loginAction'
import { useUiStore } from '../../stores/appStores'
import { Button } from '../../components/ui/Button'
import { McFaceAvatar } from './McFaceAvatar'
import { mcFaceUrl } from './mcFace'
import { cropSkinFaceDataUrl } from './skinFace'

function LoggedOutUserIcon({ size }: { size: number }) {
  const iconSize = Math.round(size * 0.55)
  return (
    <div
      className="flex shrink-0 items-center justify-center border border-[var(--color-border)] bg-[var(--color-accent-soft)] text-[var(--color-text-muted)]"
      style={{
        width: size,
        height: size,
        borderRadius: size >= 40 ? 'var(--radius-md)' : 'var(--radius-sm)',
      }}
    >
      <IconUser size={iconSize} stroke={1.75} aria-hidden />
    </div>
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

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => fledgeApi.settings.get(),
  })
  const selectedSkinId = settingsQuery.data?.selectedSkinId
  const account = sessionQuery.data?.account
  /** 期限切れ・未ログインはスキン顔を出さず汎用アイコンにする */
  const showUserFace =
    Boolean(account) && authStatus !== 'expired' && authStatus !== 'logged_out'

  const chipFaceQuery = useQuery({
    queryKey: ['account-face', selectedSkinId, 32],
    enabled: showUserFace && Boolean(selectedSkinId),
    staleTime: 30 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const dataUrl = await fledgeApi.skins.getDataUrl(selectedSkinId!)
      if (!dataUrl) return null
      return cropSkinFaceDataUrl(dataUrl, 32)
    },
  })

  const switchMutation = useMutation({
    mutationFn: (id: string) => fledgeApi.auth.switch(id),
    onSuccess: async (next) => {
      applyLoggedInAccount(queryClient, next)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['skins'] }),
        queryClient.invalidateQueries({ queryKey: ['settings'] }),
        queryClient.invalidateQueries({ queryKey: ['account-face'] }),
      ])
    },
  })

  const logoutMutation = useMutation({
    mutationFn: (id?: string) => fledgeApi.auth.logout(id),
    onSuccess: async () => {
      setOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['session'] })
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
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

  const accounts = accountsQuery.data ?? []
  const faceUrl = showUserFace ? (chipFaceQuery.data ?? mcFaceUrl(account, 32)) : null
  const popupFaceUrl = showUserFace
    ? (chipFaceQuery.data ?? mcFaceUrl(account, 48))
    : null

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
          <div
            className={[
              'truncate font-medium leading-none',
              authStatus === 'expired' ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]',
            ].join(' ')}
          >
            {chipLabel}
          </div>
          {authStatus !== 'expired' && accounts.length > 1 ? (
            <div className="text-xs leading-tight text-[var(--color-text-muted)]">
              {t('auth.accountCount', { count: accounts.length })}
            </div>
          ) : null}
        </div>
        {faceUrl ? <McFaceAvatar src={faceUrl} size={32} /> : <LoggedOutUserIcon size={32} />}
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
              <LoggedOutUserIcon size={48} />
            )}
            <div className="min-w-0 space-y-1">
              <p className="truncate text-sm font-semibold text-[var(--color-text)]">
                {account?.displayName ?? t('auth.status.loggedOut')}
              </p>
              <p
                className={[
                  'text-xs',
                  authStatus === 'expired'
                    ? 'text-[var(--color-danger)]'
                    : 'text-[var(--color-text-muted)]',
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
                  // 使用中はヘッダーと同じ選択スキン顔。他アカウントは mc-heads
                  const aFace = active
                    ? (chipFaceQuery.data ?? mcFaceUrl(a, 28))
                    : mcFaceUrl(a, 28)
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
              {authStatus === 'expired' ? t('auth.loginShort') : t('auth.addAccount')}
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
