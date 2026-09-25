import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  IconAlertCircle,
  IconLogin,
  IconPlayerPlay,
  IconPlayerStop,
} from '@tabler/icons-react'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../../components/ui/Button'
import { formatProgressMessage } from '../launch/formatProgressMessage'
import { formatLaunchErrorDisplay } from '../launch/formatLaunchErrorDisplay'
import { startLogin } from '../auth/loginAction'
import { sessionQueryOptions } from '../auth/sessionCache'
import { useLaunchStore, useUiStore, useInstanceCreateStore } from '../../stores/appStores'
import { useDebugStore } from '../../stores/debugStore'
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

/** インストール／作成中と同じぐるぐるリング（円） */
function BusyRing() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full animate-spin motion-reduce:animate-none"
      viewBox="0 0 36 36"
      aria-hidden
    >
      <circle
        cx="18"
        cy="18"
        r="15.5"
        fill="none"
        stroke="var(--color-accent)"
        strokeOpacity="0.22"
        strokeWidth="2.5"
      />
      <circle
        cx="18"
        cy="18"
        r="15.5"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="22 76"
      />
    </svg>
  )
}

/** 楕円（カプセル）ボタンの縁を追うぐるぐる */
function BusyCapsuleRing({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width > 0 && height > 0) setBox({ w: width, h: height })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const stroke = 2.5
  const inset = stroke / 2
  const w = box?.w ?? 0
  const h = box?.h ?? 0
  const rw = Math.max(0, w - stroke)
  const rh = Math.max(0, h - stroke)
  const rx = rh / 2

  return (
    <div ref={ref} className="relative inline-flex" aria-busy="true">
      {box ? (
        <svg
          className="pointer-events-none absolute inset-0 overflow-visible"
          width={w}
          height={h}
          aria-hidden
        >
          <rect
            x={inset}
            y={inset}
            width={rw}
            height={rh}
            rx={rx}
            ry={rx}
            fill="none"
            stroke="var(--color-accent)"
            strokeOpacity="0.22"
            strokeWidth={stroke}
          />
          <rect
            className="busy-capsule-arc"
            x={inset}
            y={inset}
            width={rw}
            height={rh}
            rx={rx}
            ry={rx}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={stroke}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="0.2 0.8"
          />
        </svg>
      ) : null}
      {children}
    </div>
  )
}

const IS_DEV = import.meta.env.DEV

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
  const launchProgressPreview = useDebugStore((s) => s.launchProgressPreview)
  const showPreview = IS_DEV && launchProgressPreview && !active
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
  showProgress = false,
}: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const authStatus = useUiStore((s) => s.authStatus)
  const sessionAccount = useQuery({
    queryKey: ['session'],
    ...sessionQueryOptions,
    queryFn: () => fledgeApi.auth.session(),
    select: (d) => d.account,
  }).data
  const creating = useInstanceCreateStore((s) => Boolean(s.creatingIds[instanceId]))
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
  const errorDetail = useLaunchStore((s) =>
    s.errorProfileId === instanceId ? s.errorDetail : null,
  )
  const launchErrorPreview = useDebugStore((s) => s.launchErrorPreview)
  const previewErrorKey =
    IS_DEV && launchErrorPreview && !errorMessageKey ? 'launch.error.gameExited' : null
  const displayErrorKey = errorMessageKey ?? previewErrorKey
  const displayErrorDetail =
    errorDetail ??
    (IS_DEV && launchErrorPreview && !errorMessageKey
      ? 'exit code 1\njava.lang.Exception: (debug preview)'
      : null)
  const errorDisplay = displayErrorKey
    ? formatLaunchErrorDisplay(t, displayErrorKey, displayErrorDetail)
    : null

  const busyInstalling =
    creating || state === 'preparing' || state === 'launching'

  const hasAccount = Boolean(sessionAccount)
  // セッションにアカウントがあればログイン扱い（zustand 初期値 logged_out の誤判定を防ぐ）
  const canPlay =
    !busyInstalling &&
    hasAccount &&
    authStatus !== 'expired' &&
    authStatus !== 'logging_in' &&
    state !== 'running'

  const needsLogin =
    !hasAccount || authStatus === 'expired' || authStatus === 'logging_in'

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
      await fledgeApi.launch.start(
        instanceId,
        sessionAccount?.id ? { accountId: sessionAccount.id } : undefined,
      )
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
      variant={busyInstalling ? 'secondary' : 'primary'}
      className={[
        sizeClass,
        className,
        busyInstalling
          ? 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] opacity-80'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={!canPlay}
      aria-label={busyInstalling ? t('content.creatingInstance') : t('home.play')}
      aria-busy={busyInstalling || undefined}
      onClick={(e) => void onPlay(e)}
    >
      {size === 'icon' || (busyInstalling && size === 'sm') ? (
        <IconPlayerPlay size={playIconSize} stroke={1.75} />
      ) : (
        <>
          <IconPlayerPlay size={playIconSize} stroke={1.75} />
          {t('home.play')}
        </>
      )}
    </Button>
  )

  // カード上（icon/sm）は角丸四角ボタンに円リングを被せない — TransferProgress と同じ円形にする
  if (busyInstalling && (size === 'icon' || size === 'sm')) {
    action = (
      <div className="relative size-10 shrink-0" aria-busy="true">
        <BusyRing />
        <button
          type="button"
          disabled
          aria-label={t('content.creatingInstance')}
          className="absolute inset-[3px] grid place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]"
        >
          <IconPlayerPlay size={16} stroke={1.75} aria-hidden />
        </button>
      </div>
    )
  } else if (busyInstalling) {
    // header / lg: 楕円のまま無効化し、縁に沿うぐるぐる
    action = (
      <BusyCapsuleRing>
        <Button
          variant="secondary"
          className={[
            sizeClass,
            className,
            '!rounded-full border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] opacity-80',
          ]
            .filter(Boolean)
            .join(' ')}
          disabled
          aria-label={t('content.creatingInstance')}
          aria-busy
        >
          <IconPlayerPlay size={playIconSize} stroke={1.75} />
          {t('home.play')}
        </Button>
      </BusyCapsuleRing>
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
  const showError = Boolean(errorDisplay)
  const [errorOpen, setErrorOpen] = useState(false)
  const [errorHover, setErrorHover] = useState(false)
  const errorWrapRef = useRef<HTMLDivElement>(null)
  const errorBtnRef = useRef<HTMLButtonElement>(null)
  const errorTipRef = useRef<HTMLDivElement>(null)
  const errorHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [errorPos, setErrorPos] = useState<{
    top: number
    left: number
    placeAbove: boolean
  } | null>(null)
  const errorVisible = showError && (errorOpen || errorHover)

  const setErrorHoverSoon = (next: boolean) => {
    if (errorHoverTimer.current) {
      clearTimeout(errorHoverTimer.current)
      errorHoverTimer.current = null
    }
    if (next) {
      setErrorHover(true)
      return
    }
    errorHoverTimer.current = setTimeout(() => setErrorHover(false), 120)
  }

  useEffect(() => {
    return () => {
      if (errorHoverTimer.current) clearTimeout(errorHoverTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!errorOpen) return
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node
      if (errorWrapRef.current?.contains(target) || errorTipRef.current?.contains(target)) return
      setErrorOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [errorOpen])

  useEffect(() => {
    if (!showError) {
      setErrorOpen(false)
      setErrorHover(false)
    }
  }, [showError])

  useLayoutEffect(() => {
    if (!errorVisible) {
      setErrorPos(null)
      return
    }
    const update = () => {
      const btn = errorBtnRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const width = Math.min(360, window.innerWidth * 0.82)
      let left = rect.right - width
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
      const placeAbove = rect.top > 80
      const top = placeAbove ? rect.top - 8 : rect.bottom + 8
      setErrorPos({ top, left, placeAbove })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [errorVisible])

  // スタートボタン（icon/sm は size-10）の約 2/3
  const errorBtnClass =
    size === 'icon' || size === 'sm'
      ? 'size-[1.675rem]'
      : size === 'header' || size === 'lg'
        ? 'size-7'
        : 'size-6'
  const errorIconSize =
    size === 'icon' || size === 'sm' ? 14 : size === 'header' || size === 'lg' ? 16 : 14

  const errorButton = showError ? (
    <div
      ref={errorWrapRef}
      className="relative flex shrink-0 items-center"
      onMouseEnter={() => setErrorHoverSoon(true)}
      onMouseLeave={() => setErrorHoverSoon(false)}
    >
      <button
        ref={errorBtnRef}
        type="button"
        className={[
          'inline-flex shrink-0 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_14%,transparent)] text-[var(--color-danger)] transition hover:bg-[color-mix(in_srgb,var(--color-danger)_24%,transparent)]',
          errorBtnClass,
        ].join(' ')}
        aria-label={t('launch.error.showDetails')}
        aria-expanded={errorVisible}
        onClick={(e: ReactMouseEvent) => {
          stop(e)
          setErrorOpen((v) => !v)
        }}
      >
        <IconAlertCircle size={errorIconSize} stroke={2} aria-hidden />
      </button>
      {errorVisible && errorPos
        ? createPortal(
            <div
              ref={errorTipRef}
              role="tooltip"
              className="pointer-events-auto fixed z-[200] w-[min(22.5rem,82vw)] max-h-[min(40vh,16rem)] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs leading-relaxed shadow-md"
              style={{
                top: errorPos.top,
                left: errorPos.left,
                transform: errorPos.placeAbove ? 'translateY(-100%)' : undefined,
              }}
              onClick={stop}
              onMouseEnter={() => setErrorHoverSoon(true)}
              onMouseLeave={() => setErrorHoverSoon(false)}
            >
              <p className="font-medium text-[var(--color-danger)]">{errorDisplay!.summary}</p>
              {errorDisplay!.detail ? (
                <div className="mt-2 space-y-1 border-t border-[var(--color-border)] pt-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                    {t('launch.error.causeLabel')}
                  </p>
                  <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-[var(--color-text)]">
                    {errorDisplay!.detail}
                  </pre>
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  ) : null

  // icon/sm は円リング、header/lg は楕円縁リング

  return (
    <div
      className={
        size === 'icon' || size === 'sm'
          ? 'flex shrink-0 items-center gap-1.5 self-center'
          : showProgress
            ? 'flex max-w-full items-center justify-end gap-2'
            : 'flex shrink-0 items-center gap-2'
      }
      onClick={stop}
    >
      {errorButton}
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
      </div>
    </div>
  )
}
