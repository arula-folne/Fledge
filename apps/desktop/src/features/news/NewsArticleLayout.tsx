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
              ? 'news-card-title text-base font-semibold leading-snug text-[var(--color-text)]'
              : 'news-card-title text-lg font-semibold leading-snug text-[var(--color-text)]'
            : 'news-card-title text-[length:var(--news-preview-title)] font-semibold leading-snug text-[var(--color-text)]'
        }
      >
        {title}
      </h3>
      {mode === 'full' ? (
        <MarkdownBody text={body} className={compact ? 'news-md text-sm' : 'news-md'} />
      ) : (
        <p className="news-card-body line-clamp-2 text-[length:var(--news-preview-body)] leading-snug text-[color-mix(in_srgb,var(--color-text)_78%,var(--color-text-muted))]">
          {newsPreview(body)}
        </p>
      )}
      <p
        className={
          mode === 'full'
            ? compact
              ? 'news-card-date mt-1 text-xs tabular-nums text-[var(--color-text-muted)]'
              : 'news-card-date mt-1 text-sm tabular-nums text-[var(--color-text-muted)]'
            : 'news-card-date text-[length:var(--news-preview-date)] tabular-nums text-[color-mix(in_srgb,var(--color-text)_55%,var(--color-text-muted))]'
        }
      >
        {date}
      </p>
    </div>
  )
}
