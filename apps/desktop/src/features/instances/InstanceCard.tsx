import { memo, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { InstanceProfile } from '@fledge/shared'
import { useLaunchStore, useInstanceCreateStore } from '../../stores/appStores'
import { formatProgressMessage } from '../launch/formatProgressMessage'
import { InstanceIcon } from './InstanceIcon'
import { InstanceLaunchButton } from './InstanceLaunchButton'
import { LaunchProgressIndicator, LAUNCH_PROGRESS_WIDTH } from './launchProgressUi'
import { formatLastPlayed, formatLoaderLabel } from './instanceMeta'

type Props = {
  instance: InstanceProfile
  /** 大きいヒーローカード（ホーム用） */
  variant?: 'list' | 'hero'
  /** ホーム一覧など狭いグリッド向け */
  density?: 'default' | 'compact'
  className?: string
  onContextMenu?: (event: MouseEvent, instance: InstanceProfile) => void
}

export const InstanceCard = memo(function InstanceCard({
  instance,
  variant = 'list',
  density = 'default',
  className = '',
  onContextMenu,
}: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const detailPath = `/library/${instance.id}`
  const creating = useInstanceCreateStore((s) => Boolean(s.creatingIds[instance.id]))

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
              {creating ? (
                <span className="ml-2 text-sm font-medium text-[var(--color-accent)]">
                  {t('content.creatingInstance')}
                </span>
              ) : null}
            </h3>
            <p className="mt-1 truncate text-sm text-[var(--color-text-muted)]">
              {instance.minecraftVersion} · {formatLoaderLabel(instance.loader, t)}
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {t('instances.lastPlayed')}: {formatLastPlayed(instance.lastPlayedAt, t)}
            </p>
          </div>
          <InstanceLaunchButton instanceId={instance.id} size="lg" />
        </div>
      </article>
    )
  }

  const compact = density === 'compact'

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
        'group flex h-full min-w-0 cursor-pointer rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] transition',
        compact
          ? 'items-center gap-2.5 px-3 py-3'
          : 'min-h-[4.75rem] items-center gap-3 px-3.5 py-3.5',
        'hover:border-[var(--color-accent)]/35 hover:bg-[var(--color-hover)]/50',
        className,
      ].join(' ')}
    >
      <InstanceIcon instance={instance} size="md" className="shrink-0 self-center" />
      <div className="min-w-0 flex-1">
        <div
          className={[
            'font-medium leading-snug break-words text-[var(--color-text)]',
            compact ? 'text-sm' : 'text-base',
          ].join(' ')}
        >
          {instance.name}
          {creating ? (
            <span className="ml-1.5 text-xs font-medium text-[var(--color-accent)]">
              {t('content.creatingInstance')}
            </span>
          ) : null}
        </div>
        <div
          className={[
            'mt-1 leading-snug break-words text-[var(--color-text-muted)]',
            compact ? 'text-xs' : 'text-sm',
          ].join(' ')}
        >
          {instance.minecraftVersion} · {formatLoaderLabel(instance.loader, t)}
        </div>
        <div
          className={[
            'mt-0.5 leading-snug break-words text-[var(--color-text-muted)]',
            compact ? 'text-xs' : 'text-sm',
          ].join(' ')}
        >
          {formatLastPlayed(instance.lastPlayedAt, t)}
        </div>
        <InstancePrepareProgress instanceId={instance.id} compact={compact} />
      </div>
      <InstanceLaunchButton
        instanceId={instance.id}
        size={compact ? 'icon' : 'sm'}
        showProgress={!compact}
        className={compact ? 'shrink-0 self-center' : undefined}
      />
    </article>
  )
})

/** リストカード向け：準備中のプログレスを本文側にも出す */
function InstancePrepareProgress({
  instanceId,
  compact = false,
}: {
  instanceId: string
  compact?: boolean
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

  if (!active) return null

  const percent =
    progress?.percent ??
    (progress && progress.total > 0 ? (progress.current / progress.total) * 100 : 0)

  return (
    <div className={['mt-1.5 w-full max-w-full', compact ? '' : LAUNCH_PROGRESS_WIDTH].join(' ')}>
      <LaunchProgressIndicator
        message={formatProgressMessage(
          t,
          progress?.messageKey ?? phaseMessageKey,
          progress?.meta,
          'library.preparing',
        )}
        percent={percent}
        compact={compact}
      />
    </div>
  )
}