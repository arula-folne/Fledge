import { useTranslation } from 'react-i18next'
import { IconDownload, IconLayoutGrid } from '@tabler/icons-react'
import type { ContentCategory } from '@fledge/shared'
import { ContentCategoryIcon } from './contentCategoryIcons'
import type { FavoriteCategoryFilter } from './contentFavoritesList'

const ICON_SIZE = 22

export type FavoriteBulkInstallProps = {
  pendingCount: number
  installing: boolean
  disabled?: boolean
  onInstall: () => void
}

type Props = {
  categories: ContentCategory[]
  counts: Map<ContentCategory, number>
  active: FavoriteCategoryFilter
  onChange: (next: FavoriteCategoryFilter) => void
  bulkInstall?: FavoriteBulkInstallProps
}

export function FavoriteCategoryFilters({
  categories,
  counts,
  active,
  onChange,
  bulkInstall,
}: Props) {
  const { t } = useTranslation()

  if (categories.length === 0 && !bulkInstall) return null

  const buttonClass = (selected: boolean) =>
    [
      'relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] transition-colors',
      selected
        ? 'bg-[var(--color-selection)] ring-1 ring-[var(--color-selection)]'
        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)]',
    ].join(' ')

  const countBadge = (count: number) =>
    count > 0 ? (
      <span className="pointer-events-none absolute -right-0.5 -top-0.5 min-w-[1.125rem] rounded-full bg-[var(--color-accent)] px-1 text-center text-[10px] font-semibold leading-[1.125rem] text-[var(--color-on-accent)] tabular-nums">
        {count}
      </span>
    ) : null

  const bulkDisabled =
    !bulkInstall ||
    bulkInstall.installing ||
    bulkInstall.disabled ||
    bulkInstall.pendingCount === 0

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <button
          type="button"
          className={buttonClass(active === 'all')}
          onClick={() => onChange('all')}
          aria-label={t('content.category.all')}
          aria-pressed={active === 'all'}
        >
          <IconLayoutGrid
            size={ICON_SIZE}
            stroke={1.75}
            className={[
              'shrink-0',
              active === 'all' ? 'text-[var(--color-on-selection)]' : 'text-[var(--color-text-muted)]',
            ].join(' ')}
            aria-hidden
          />
        </button>
        {categories.map((category) => {
          const count = counts.get(category) ?? 0
          const selected = active === category
          return (
            <button
              key={category}
              type="button"
              className={buttonClass(selected)}
              onClick={() => onChange(category)}
              aria-label={`${t(`content.category.${category}`)} (${count})`}
              aria-pressed={selected}
            >
              <ContentCategoryIcon category={category} size={ICON_SIZE} />
              {countBadge(count)}
            </button>
          )
        })}
      </div>
      {bulkInstall ? (
        <button
          type="button"
          disabled={bulkDisabled}
          className={[
            'ml-auto inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-sm font-medium transition-[filter,opacity]',
            bulkInstall.pendingCount === 0
              ? 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] opacity-80'
              : 'bg-[rgb(176,214,232)] text-[rgb(36,78,102)] hover:brightness-110 disabled:opacity-50',
          ].join(' ')}
          onClick={() => void bulkInstall.onInstall()}
        >
          <IconDownload size={18} stroke={1.75} aria-hidden />
          {bulkInstall.installing
            ? t('content.favoritesInstallingAll')
            : bulkInstall.pendingCount === 0
              ? t('content.favoritesInstallAllDone')
              : t('content.favoritesInstallPageCount', { n: bulkInstall.pendingCount })}
        </button>
      ) : null}
    </div>
  )
}
