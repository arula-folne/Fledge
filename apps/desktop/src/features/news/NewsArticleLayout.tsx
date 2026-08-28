import { MarkdownBody } from '../content/MarkdownBody'
import { NewsCategoryBadge } from './NewsCategoryBadge'
import { newsPreview } from './newsFormat'

type Props = {
  category: string | null
  title: string
  body: string
  date: string
  mode?: 'preview' | 'full'
  /** ダイアログ内などコンパクト表示 */
  compact?: boolean
}

export function NewsArticleLayout({
  category,
  title,
  body,
  date,
  mode = 'preview',
  compact = false,
}: Props) {
  return (
    <div className={mode === 'preview' ? 'flex flex-col gap-[var(--news-preview-gap)]' : 'flex flex-col gap-2'}>
      {category ? <NewsCategoryBadge category={category} className="self-start" /> : null}
      <h3
        className={
          mode === 'full'
            ? compact
              ? 'text-base font-semibold leading-snug text-[var(--color-text)]'
              : 'text-lg font-semibold leading-snug text-[var(--color-text)]'
            : 'text-[length:var(--news-preview-title)] font-semibold leading-snug text-[var(--color-text)]'
        }
      >
        {title}
      </h3>
      {mode === 'full' ? (
        <MarkdownBody text={body} className={compact ? 'news-md text-sm' : 'news-md'} />
      ) : (
        <p className="line-clamp-2 text-[length:var(--news-preview-body)] leading-snug text-[var(--color-text-muted)]">
          {newsPreview(body)}
        </p>
      )}
      <p
        className={
          mode === 'full'
            ? compact
              ? 'mt-1 text-xs tabular-nums text-[var(--color-text-muted)]'
              : 'mt-1 text-sm tabular-nums text-[var(--color-text-muted)]'
            : 'text-[length:var(--news-preview-date)] tabular-nums text-[var(--color-text-muted)]'
        }
      >
        {date}
      </p>
    </div>
  )
}
