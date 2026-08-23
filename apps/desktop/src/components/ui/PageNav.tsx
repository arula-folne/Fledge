import { useTranslation } from 'react-i18next'

type Props = {
  page: number
  pageCount: number
  onChange: (page: number) => void
}

function pageItems(current: number, total: number): Array<number | 'gap'> {
  if (total <= 7) {
    return Array.from({ length: Math.max(1, total) }, (_, i) => i + 1)
  }
  let start = Math.max(1, current - 1)
  let end = start + 2
  if (end > total) {
    end = total
    start = Math.max(1, end - 2)
  }
  const items: Array<number | 'gap'> = []
  if (start > 1) {
    items.push(1)
    if (start > 2) items.push('gap')
  }
  for (let n = start; n <= end; n += 1) items.push(n)
  if (end < total) {
    if (end < total - 1) items.push('gap')
    items.push(total)
  }
  return items
}

const btn =
  'rounded-[var(--radius-sm)] px-2 py-1 text-sm leading-none transition-colors disabled:opacity-40'

export function PageNav({ page, pageCount, onChange }: Props) {
  const { t } = useTranslation()
  const total = Math.max(1, pageCount)
  const current = Math.min(total, Math.max(1, page))

  return (
    <nav className="flex items-center gap-1" aria-label={t('content.pager')}>
      <button
        type="button"
        className={`${btn} text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]`}
        disabled={current <= 1}
        onClick={() => onChange(current - 1)}
      >
        {t('content.prevPage')}
      </button>
      {pageItems(current, total).map((item, index) =>
        item === 'gap' ? (
          <span
            key={`gap-${index}`}
            className="px-1.5 text-xs text-[var(--color-text-muted)]"
            aria-hidden
          >
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            aria-current={item === current ? 'page' : undefined}
            aria-label={t('content.pageAria', { page: item })}
            className={[
              btn,
              'min-w-6 tabular-nums',
              item === current
                ? 'bg-[var(--color-selection-soft)] font-medium text-[var(--color-selection)]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
            ].join(' ')}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        className={`${btn} text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]`}
        disabled={current >= total}
        onClick={() => onChange(current + 1)}
      >
        {t('content.nextPage')}
      </button>
    </nav>
  )
}
