import { memo, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { InstanceProfile } from '@fledge/shared'
import { useLaunchStore } from '../../stores/appStores'
import { formatProgressMessage } from '../launch/formatProgressMessage'
import { InstanceIcon } from './InstanceIcon'
import { InstanceLaunchButton } from './InstanceLaunchButton'
import { formatLastPlayed, formatLoaderLabel } from './instanceMeta'

type Props = {
  instance: InstanceProfile
  /** 大きいヒーローカード（ホーム用） */
  variant?: 'list' | 'hero'
  className?: string
  onContextMenu?: (event: MouseEvent, instance: InstanceProfile) => void
}

export const InstanceCard = memo(function InstanceCard({
  instance,
  variant = 'list',
  className = '',
  onContextMenu,
}: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const detailPath = `/library/${instance.id}`

  const goDetail = () => navigate(detailPath)
  const handleContextMenu = (e: MouseEvent) => {
    if (!onContextMenu) return
    e.preventDefault()
    e.stopPropagation()
    onContextMenu(e, instance)
  }

  if (variant === 'hero') {
    return (
      <article
        role="link"
        tabIndex={0}
        onClick={goDetail}
        onContextMenu={handleContextMenu}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            goDetail()
          }
        }}
        className={[
          'group cursor-pointer rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition',
          'hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-hover)]/40',
          className,
        ].join(' ')}
      >
        <div className="flex flex-wrap items-center gap-4">
          <InstanceIcon instance={instance} size="lg" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-xl font-semibold text-[var(--color-text)]">
              {instance.name}
            </h3>
            <p className="mt-1 truncate text-sm text-[var(--color-text-muted)]">
              {instance.minecraftVersion} · {formatLoaderLabel(instance.loader, t)}
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {t('instances.lastPlayed')}: {formatLastPlayed(instance.lastPlayedAt, t)}
            </p>
          </div>
          <InstanceLaunchButton instanceId={instance.id} size="lg" showProgress />
        </div>
      </article>
    )
  }

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={goDetail}
      onContextMenu={handleContextMenu}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          goDetail()
        }
      }}
      className={[
        'group flex h-full min-h-[4.75rem] min-w-0 cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3.5 transition',
        'hover:border-[var(--color-accent)]/35 hover:bg-[var(--color-hover)]/50',
        className,
      ].join(' ')}
    >
      <InstanceIcon instance={instance} size="md" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-medium leading-snug text-[var(--color-text)]">
          {instance.name}
        </div>
        <div className="mt-0.5 truncate text-sm text-[var(--color-text-muted)]">
          {instance.minecraftVersion} · {formatLoaderLabel(instance.loader, t)}
          <span className="ml-1.5">{formatLastPlayed(instance.lastPlayedAt, t)}</span>
        </div>
        <InstancePrepareProgress instanceId={instance.id} />
      </div>
      <InstanceLaunchButton instanceId={instance.id} size="sm" />
    </article>
  )
})

/** リストカード向け：準備中のプログレスを本文側にも出す */
function InstancePrepareProgress({ instanceId }: { instanceId: string }) {
  const { t } = useTranslation()
  const state = useLaunchStore((s) => s.byProfileId[instanceId]?.state ?? 'idle')
  const sessionId = useLaunchStore((s) => s.byProfileId[instanceId]?.sessionId)
  const focusSessionId = useLaunchStore((s) => s.focusSessionId)
  const focused =
    sessionId != null && (focusSessionId === sessionId || !focusSessionId)
  const active = focused && (state === 'preparing' || state === 'launching')
  const phaseMessageKey = useLaunchStore((s) => (active ? s.phaseMessageKey : null))
  const progress = useLaunchStore((s) => (active ? s.progress : null))

  if (!active) return null

  const percent =
    progress?.percent ??
    (progress && progress.total > 0 ? (progress.current / progress.total) * 100 : 0)

  return (
    <div className="mt-2 max-w-sm space-y-1">
      <div className="text-[11px] text-[var(--color-text-muted)]">
        {formatProgressMessage(
          t,
          progress?.messageKey ?? phaseMessageKey,
          progress?.meta,
          'library.preparing',
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-accent-soft)]">
        <div
          className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-150"
          style={{ width: `${Math.min(100, Math.max(4, percent))}%` }}
        />
      </div>
    </div>
  )
}