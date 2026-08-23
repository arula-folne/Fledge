import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { IconPlayerPlay, IconPlayerStop, IconX } from '@tabler/icons-react'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../../components/ui/Button'
import { formatProgressMessage } from '../launch/formatProgressMessage'
import { useLaunchStore, useUiStore } from '../../stores/appStores'

type Props = {
  instanceId: string
  /** ボタンサイズ */
  size?: 'default' | 'lg' | 'sm'
  className?: string
  /** 進捗バーを下に出す（ホーム・詳細向け） */
  showProgress?: boolean
}

/**
 * インスタンス単位の起動 / キャンセル / 終了。
 * click は stopPropagation（カード遷移と分離）。
 */
export function InstanceLaunchButton({
  instanceId,
  size = 'default',
  className = '',
  showProgress = false,
}: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const authStatus = useUiStore((s) => s.authStatus)
  const setAuthStatus = useUiStore((s) => s.setAuthStatus)
  const byProfileId = useLaunchStore((s) => s.byProfileId)
  const stateFor = useLaunchStore((s) => s.stateFor)
  const focusSessionId = useLaunchStore((s) => s.focusSessionId)
  const phaseMessageKey = useLaunchStore((s) => s.phaseMessageKey)
  const progress = useLaunchStore((s) => s.progress)
  const errorMessageKey = useLaunchStore((s) => s.errorMessageKey)
  const errorProfileId = useLaunchStore((s) => s.errorProfileId)

  const state = stateFor(instanceId)
  const session = byProfileId[instanceId]
  const focused =
    session?.sessionId != null &&
    (focusSessionId === session.sessionId || !focusSessionId)

  const canPlay =
    (authStatus === 'logged_in' || authStatus === 'refreshing') &&
    state !== 'preparing' &&
    state !== 'launching' &&
    state !== 'running'

  const percent =
    progress?.percent ??
    (progress && progress.total > 0 ? (progress.current / progress.total) * 100 : 0)

  const sizeClass =
    size === 'lg'
      ? 'min-w-36 px-6 py-2.5 text-base'
      : size === 'sm'
        ? 'min-w-0 shrink-0 px-3 py-1.5 text-xs'
        : ''
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16
  const playIconSize = size === 'sm' ? 14 : 18

  const onPlay = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    await fledgeApi.settings.set({
      selectedInstanceId: instanceId,
      lastPlayedInstanceId: instanceId,
    })
    await queryClient.invalidateQueries({ queryKey: ['settings'] })
    try {
      await fledgeApi.launch.start(instanceId)
      await queryClient.invalidateQueries({ queryKey: ['instances'] })
    } catch {
      // 状態イベントで通知
    }
  }

  const stop = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
  }

  let action = (
    <Button
      variant="primary"
      className={[sizeClass, className].join(' ')}
      disabled={!canPlay}
      onClick={(e) => void onPlay(e)}
    >
      <IconPlayerPlay size={playIconSize} stroke={1.75} />
      {t('home.play')}
    </Button>
  )

  if (state === 'preparing' || state === 'launching') {
    action = (
      <Button
        variant="secondary"
        className={[sizeClass, className].join(' ')}
        onClick={(e) => {
          stop(e)
          void fledgeApi.launch.cancel(session?.sessionId)
        }}
      >
        <IconX size={iconSize} stroke={1.75} />
        {t('home.cancel')}
      </Button>
    )
  } else if (state === 'running') {
    action = (
      <Button
        variant="danger"
        className={[sizeClass, className].join(' ')}
        onClick={(e) => {
          stop(e)
          void fledgeApi.launch.kill(session?.sessionId)
        }}
      >
        <IconPlayerStop size={iconSize} stroke={1.75} />
        {size === 'sm' ? t('home.killGameShort') : t('home.killGame')}
      </Button>
    )
  } else if (authStatus === 'logged_out' || authStatus === 'expired') {
    action = (
      <Button
        variant="success"
        className={[sizeClass, className].join(' ')}
        onClick={(e) => {
          stop(e)
          setAuthStatus('logging_in')
          void queryClient.cancelQueries({ queryKey: ['session'] })
          void fledgeApi.auth.login()
        }}
      >
        {size === 'sm' ? t('auth.loginShort') : t('auth.login')}
      </Button>
    )
  }

  return (
    <div className={size === 'sm' ? 'shrink-0' : 'space-y-2'} onClick={stop}>
      {action}
      {focused &&
      (state === 'preparing' || state === 'launching' || (showProgress && state === 'running')) ? (
        <div className={size === 'sm' ? 'hidden' : 'min-w-[12rem] space-y-1.5'}>
          <div className="text-xs text-[var(--color-text-muted)]">
            {formatProgressMessage(t, progress?.messageKey ?? phaseMessageKey, progress?.meta)}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-accent-soft)]">
            <div
              className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-150"
              style={{ width: `${Math.min(100, Math.max(4, percent))}%` }}
            />
          </div>
        </div>
      ) : null}
      {errorMessageKey && errorProfileId === instanceId ? (
        <div className="rounded-[var(--radius-sm)] bg-[var(--color-danger)]/15 px-2 py-1.5 text-xs text-[var(--color-danger)]">
          {t(errorMessageKey)}
        </div>
      ) : null}
    </div>
  )
}
