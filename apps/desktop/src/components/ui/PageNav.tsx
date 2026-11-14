import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

type Props = {
  page: number
  pageCount: number
  onChange: (page: number) => void
}

/** 数字スロット数（… 含む）。総ページ数に関係なく常にこの個数分の幅を確保する */
const PAGE_SLOT_COUNT = 7
/** 各円ボタンの固定サイズ（桁が増えてもレイアウトが伸びない） */
const PAGE_SLOT_PX = 32
const PAGE_SLOT_GAP_PX = 2

/**
 * 総ページが多いときは常に 7 スロット（数字 or …）を返し、
 * 少ないときも空スロットで埋めてボタン個数が変わってレイアウトがずれないようにする。
 */
function pageItems(current: number, total: number): Array<number | 'gap' | 'empty'> {
  if (total <= PAGE_SLOT_COUNT) {
    return Array.from({ length: PAGE_SLOT_COUNT }, (_, i) =>
      i < total ? i + 1 : 'empty',
    )
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, 'gap', total]
  }
  if (current >= total - 3) {
    return [1, 'gap', total - 4, total - 3, total - 2, total - 1, total]
  }
  return [1, 'gap', current - 1, current, current + 1, 'gap', total]
}

const circleBtn =
  'inline-flex shrink-0 items-center justify-center rounded-full text-sm leading-none tabular-nums transition-colors disabled:opacity-40'

export function PageNav({ page, pageCount, onChange }: Props) {
  const { t } = useTranslation()
  const total = Math.max(1, pageCount)
  const current = Math.min(total, Math.max(1, page))
  const slotStyle = { width: PAGE_SLOT_PX, height: PAGE_SLOT_PX, minWidth: PAGE_SLOT_PX }
  const chevronSize = 18
  const items = pageItems(current, total)
  const navWidth = (PAGE_SLOT_COUNT + 2) * (PAGE_SLOT_PX + PAGE_SLOT_GAP_PX) - PAGE_SLOT_GAP_PX

  return (
    <nav
      className="flex shrink-0 items-center justify-between"
      aria-label={t('content.pager')}
      style={{ width: navWidth, gap: PAGE_SLOT_GAP_PX }}
    >
      <button
        type="button"
        style={slotStyle}
        className={`${circleBtn} text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]`}
        disabled={current <= 1}
        aria-label={t('content.prevPage')}
        onClick={() => onChange(current - 1)}
      >
        <IconChevronLeft size={chevronSize} stroke={1.75} aria-hidden />
      </button>
      <div className="flex items-center" style={{ gap: PAGE_SLOT_GAP_PX }}>
        {items.map((item, index) =>
          item === 'empty' ? (
            <span key={`empty-${index}`} style={slotStyle} aria-hidden className="invisible" />
          ) : item === 'gap' ? (
            <span
              key={`gap-${index}`}
              className="inline-flex items-center justify-center text-xs text-[var(--color-text-muted)]"
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
                circleBtn,
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
        style={slotStyle}
        className={`${circleBtn} text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]`}
        disabled={current >= total}
        aria-label={t('content.nextPage')}
        onClick={() => onChange(current + 1)}
      >
        <IconChevronRight size={chevronSize} stroke={1.75} aria-hidden />
      </button>
    </nav>
  )
}
