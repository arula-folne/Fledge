import { MarkdownBody } from '../content/MarkdownBody'
import { NewsCategoryBadge } from './NewsCategoryBadge'
import { newsPreview } from './newsFormat'

type Props = {
  category: string | null
  title: string
  body: string
  date: string
  mode?: 'preview' | 'full'
}

export function NewsArticleLayout({
  category,
  title,
  body,
  date,
  mode = 'preview',
}: Props) {
  return (
    <div className="flex flex-col gap-2">
      {category ? <NewsCategoryBadge category={category} className="self-start" /> : null}
      <h3
        className={
          mode === 'full'
            ? 'text-lg font-semibold leading-snug text-[var(--color-text)]'
            : 'text-sm font-semibold leading-snug text-[var(--color-text)]'
        }
      >
        {title}
      </h3>
      {mode === 'full' ? (
        <MarkdownBody text={body} className="news-md" />
      ) : (
        <p className="line-clamp-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
          {newsPreview(body)}
        </p>
      )}
      <p
        className={
          mode === 'full'
            ? 'mt-1 text-sm tabular-nums text-[var(--color-text-muted)]'
            : 'text-[10px] tabular-nums text-[var(--color-text-muted)]'
        }
      >
        {date}
      </p>
    </div>
  )
}
