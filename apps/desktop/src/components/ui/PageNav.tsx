import { useTranslation } from 'react-i18next'

type Props = {
  page: number
  pageCount: number
  onChange: (page: number) => void
}

/**
 * 総ページが多いときは常に 7 スロット（数字 or …）を返し、
 * ページ移動でボタン個数が変わってレイアウトがずれないようにする。
 */
function pageItems(current: number, total: number): Array<number | 'gap'> {
  if (total <= 7) {
    return Array.from({ length: Math.max(1, total) }, (_, i) => i + 1)
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, 'gap', total]
  }
  if (current >= total - 3) {
    return [1, 'gap', total - 4, total - 3, total - 2, total - 1, total]
  }
  return [1, 'gap', current - 1, current, current + 1, 'gap', total]
}

const btn =
  'inline-flex h-7 items-center justify-center rounded-[var(--radius-sm)] px-1.5 text-sm leading-none tabular-nums transition-colors disabled:opacity-40'

export function PageNav({ page, pageCount, onChange }: Props) {
  const { t } = useTranslation()
  const total = Math.max(1, pageCount)
  const current = Math.min(total, Math.max(1, page))
  // 最大桁（最終ページ）に合わせて各スロット幅を固定
  const slotCh = Math.max(2, String(total).length)
  const slotStyle = { minWidth: `calc(${slotCh}ch + 0.75rem)` }
  const items = pageItems(current, total)
  // 7 スロット分の幅を常に確保（総ページが少ないときも右端がずれない）
  const slotCount = Math.max(items.length, total > 7 ? 7 : total)

  return (
    <nav
      className="flex shrink-0 items-center gap-0.5"
      aria-label={t('content.pager')}
      style={{
        minWidth: `calc(5.5rem + ${slotCount} * (${slotCh}ch + 0.75rem + 0.125rem))`,
      }}
    >
      <button
        type="button"
        className={`${btn} px-2 text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]`}
        disabled={current <= 1}
        onClick={() => onChange(current - 1)}
      >
        {t('content.prevPage')}
      </button>
      <div className="flex flex-1 items-center justify-center gap-0.5">
        {items.map((item, index) =>
          item === 'gap' ? (
            <span
              key={`gap-${index}`}
              className="inline-flex h-7 items-center justify-center text-xs text-[var(--color-text-muted)]"
              style={slotStyle}
              aria-hidden
            >
              …
            </span>
          ) : (
            <button
              key={`${item}-${index}`}
              type="button"
              aria-current={item === current ? 'page' : undefined}
              aria-label={t('content.pageAria', { page: item })}
              style={slotStyle}
              className={[
                btn,
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
      </div>
      <button
        type="button"
        className={`${btn} px-2 text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]`}
        disabled={current >= total}
        onClick={() => onChange(current + 1)}
      >
        {t('content.nextPage')}
      </button>
    </nav>
  )
}
