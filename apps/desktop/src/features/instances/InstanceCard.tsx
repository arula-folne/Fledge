import { memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { InstanceProfile } from '@fledge/shared'
import { InstanceIcon } from './InstanceIcon'
import { InstanceLaunchButton } from './InstanceLaunchButton'
import { formatLastPlayed, formatLoaderLabel } from './instanceMeta'

type Props = {
  instance: InstanceProfile
  /** 大きいヒーローカード（ホーム用） */
  variant?: 'list' | 'hero'
  className?: string
}

export const InstanceCard = memo(function InstanceCard({
  instance,
  variant = 'list',
  className = '',
}: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const detailPath = `/library/${instance.id}`

  const goDetail = () => navigate(detailPath)

  if (variant === 'hero') {
    return (
      <article
        role="link"
        tabIndex={0}
        onClick={goDetail}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            goDetail()
          }
        }}
        className={[
          'group cursor-pointer rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition duration-200',
          'hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-hover)]/40',
          className,
        ].join(' ')}
      >
        <div className="flex flex-wrap items-start gap-4">
          <InstanceIcon loader={instance.loader} size="lg" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-xl font-semibold text-[var(--color-text)]">
              {instance.name}
            </h3>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
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
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          goDetail()
        }
      }}
      className={[
        'group flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 transition duration-200',
        'hover:border-[var(--color-accent)]/35 hover:bg-[var(--color-hover)]/50',
        className,
      ].join(' ')}
    >
      <InstanceIcon loader={instance.loader} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-[var(--color-text)]">{instance.name}</div>
        <div className="truncate text-sm text-[var(--color-text-muted)]">
          {instance.minecraftVersion} · {formatLoaderLabel(instance.loader, t)}
        </div>
        <div className="mt-0.5 text-xs text-[var(--color-text-muted)]">
          {formatLastPlayed(instance.lastPlayedAt, t)}
        </div>
      </div>
      <InstanceLaunchButton instanceId={instance.id} />
    </article>
  )
})
