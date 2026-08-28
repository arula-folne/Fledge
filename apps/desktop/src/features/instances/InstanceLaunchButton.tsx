import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { IconLogin, IconPlayerPlay, IconPlayerStop, IconX } from '@tabler/icons-react'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../../components/ui/Button'
import { formatProgressMessage } from '../launch/formatProgressMessage'
import { startLogin } from '../auth/loginAction'
import { useLaunchStore, useUiStore } from '../../stores/appStores'
import {
  LAUNCH_PROGRESS_SLOT,
  LaunchProgressIndicator,
} from './launchProgressUi'

type Props = {
  instanceId: string
  /** ボタンサイズ */
  size?: 'default' | 'lg' | 'header' | 'sm' | 'icon'
  className?: string
  /** false のときプログレス UI を描画しない（親が別行に配置する） */
  showProgress?: boolean
}

const DEV_LAUNCH_PROGRESS_PREVIEW =
  import.meta.env.DEV && import.meta.env.VITE_FLEDGE_DEV_LAUNCH_PROGRESS === '1'

/** 起動準備中のメッセージとプログレスバー */
export function InstanceLaunchProgress({
  instanceId,
  className = '',
}: {
  instanceId: string
  className?: string
}) {
  const { t } = useTranslation()
  const state = useLaunchStore((s) => s.byProfileId[instanceId]?.state ?? 'idle')
  const sessionId = useLaunchStore((s) => s.byProfileId[instanceId]?.sessionId)
  const active = state === 'preparing' || state === 'launching'
  const phaseMessageKey = useLaunchStore((s) =>
    active && sessionId ? (s.phaseMessageBySessionId[sessionId] ?? null) : null,
  )
  const progress = useLaunchStore((s) =>
    active && sessionId ? (s.progressBySessionId[sessionId] ?? null) : null,
  )

  const showPreview = DEV_LAUNCH_PROGRESS_PREVIEW && !active
  const visible = active || showPreview

  const percent = showPreview
    ? 42
    : progress?.percent ??
      (progress && progress.total > 0 ? (progress.current / progress.total) * 100 : 0)

  const message = showPreview
    ? t('launch.install.libraries')
    : formatProgressMessage(t, progress?.messageKey ?? phaseMessageKey, progress?.meta)

  return (
    <div
      className={[LAUNCH_PROGRESS_SLOT, className].filter(Boolean).join(' ')}
      aria-hidden={!visible}
    >
      {visible ? <LaunchProgressIndicator message={message} percent={percent} /> : null}
    </div>
  )
}

/**
 * インスタンス単位の起動 / キャンセル / 終了。
 * click は stopPropagation（カード遷移と分離）。
 * プログレスは preparing / launching のあいだだけ表示（running 後は消す）。
 */
export function InstanceLaunchButton({
  instanceId,
  size = 'default',
  className = '',
  showProgress = true,
}: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const authStatus = useUiStore((s) => s.authStatus)
  const state = useLaunchStore((s) => s.byProfileId[instanceId]?.state ?? 'idle')
  const sessionId = useLaunchStore((s) => s.byProfileId[instanceId]?.sessionId)

  const needsProgress = state === 'preparing' || state === 'launching'

  const phaseMessageKey = useLaunchStore((s) =>
    needsProgress && sessionId ? (s.phaseMessageBySessionId[sessionId] ?? null) : null,
  )
  const progress = useLaunchStore((s) =>
    needsProgress && sessionId ? (s.progressBySessionId[sessionId] ?? null) : null,
  )
  const errorMessageKey = useLaunchStore((s) =>
    s.errorProfileId === instanceId ? s.errorMessageKey : null,
  )

  const canPlay =
    (authStatus === 'logged_in' || authStatus === 'refreshing') &&
    state !== 'preparing' &&
    state !== 'launching' &&
    state !== 'running'

  const needsLogin =
    authStatus === 'logged_out' || authStatus === 'expired' || authStatus === 'logging_in'

  const percent =
    progress?.percent ??
    (progress && progress.total > 0 ? (progress.current / progress.total) * 100 : 0)

  const sizeClass =
    size === 'icon'
      ? 'size-10 shrink-0 gap-0 p-0'
      : size === 'lg'
        ? 'min-w-36 px-6 py-2.5 text-base'
        : size === 'header'
          ? 'min-h-11 min-w-[11rem] px-7 py-2.5 text-[15px] font-semibold'
          : size === 'sm'
            ? 'min-w-0 shrink-0 px-3 py-1.5 text-xs'
            : ''
  const iconSize = size === 'icon' ? 20 : size === 'sm' ? 16 : size === 'lg' || size === 'header' ? 18 : 16
  const playIconSize = size === 'icon' ? 20 : size === 'sm' ? 16 : size === 'header' ? 20 : 18

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
      aria-label={t('home.play')}
      onClick={(e) => void onPlay(e)}
    >
      {size === 'icon' ? (
        <IconPlayerPlay size={playIconSize} stroke={1.75} />
      ) : (
        <>
          <IconPlayerPlay size={playIconSize} stroke={1.75} />
          {t('home.play')}
        </>
      )}
    </Button>
  )

  if (state === 'preparing' || state === 'launching') {
    action = (
      <Button
        variant="secondary"
        className={[sizeClass, className].join(' ')}
        aria-label={t('home.cancel')}
        onClick={(e) => {
          stop(e)
          void fledgeApi.launch.cancel(sessionId)
        }}
      >
        <IconX size={iconSize} stroke={1.75} />
        {size === 'icon' ? null : t('home.cancel')}
      </Button>
    )
  } else if (state === 'running') {
    action = (
      <Button
        variant="danger"
        className={[sizeClass, className].join(' ')}
        aria-label={size === 'icon' ? t('home.killGameShort') : t('home.killGame')}
        onClick={(e) => {
          stop(e)
          void fledgeApi.launch.kill(sessionId)
        }}
      >
        <IconPlayerStop size={iconSize} stroke={1.75} />
        {size === 'icon' ? null : size === 'sm' ? t('home.killGameShort') : t('home.killGame')}
      </Button>
    )
  } else if (needsLogin) {
    action = (
      <Button
        variant="success"
        className={[sizeClass, className].join(' ')}
        disabled={authStatus === 'logging_in'}
        aria-label={t('auth.loginShort')}
        onClick={(e) => {
          stop(e)
          void startLogin(queryClient)
        }}
      >
        {size === 'icon' ? (
          <IconLogin size={iconSize} stroke={1.75} />
        ) : (
          <>
            <IconLogin size={iconSize} stroke={1.75} />
            {size === 'sm' ? t('auth.loginShort') : t('auth.login')}
          </>
        )}
      </Button>
    )
  }

  const showProgressBlock =
    showProgress && (state === 'preparing' || state === 'launching')
  const showError = Boolean(errorMessageKey)

  return (
    <div
      className={
        size === 'icon' || size === 'sm'
          ? 'shrink-0'
          : showProgress
            ? 'flex max-w-full items-center justify-end gap-2'
            : 'shrink-0'
      }
      onClick={stop}
    >
      {showError && size !== 'sm' && size !== 'icon' ? (
        <div className="min-w-0 max-w-[18rem] rounded-[var(--radius-sm)] bg-[var(--color-danger)]/15 px-2 py-1.5 text-xs text-[var(--color-danger)]">
          {t(errorMessageKey!)}
        </div>
      ) : null}
      <div className={size === 'sm' || size === 'icon' ? undefined : showProgress ? 'shrink-0 space-y-2' : undefined}>
        {action}
        {showProgressBlock && size !== 'sm' && size !== 'icon' ? (
          <div className={[LAUNCH_PROGRESS_SLOT, 'space-y-0'].join(' ')}>
            <LaunchProgressIndicator
              message={formatProgressMessage(t, progress?.messageKey ?? phaseMessageKey, progress?.meta)}
              percent={percent}
            />
          </div>
        ) : null}
        {showError && (size === 'sm' || size === 'icon') ? (
          <div className="mt-1 max-w-[10rem] rounded-[var(--radius-sm)] bg-[var(--color-danger)]/15 px-1.5 py-1 text-[10px] leading-snug text-[var(--color-danger)]">
            {t(errorMessageKey!)}
          </div>
        ) : null}
      </div>
    </div>
  )
}
