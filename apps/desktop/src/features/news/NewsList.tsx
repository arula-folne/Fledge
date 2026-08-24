import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { NewsItem } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Dialog } from '../../components/ui/Dialog'
import { Button } from '../../components/ui/Button'
import { NewsArticleLayout } from './NewsArticleLayout'
import { parseNewsTitle } from './newsFormat'

function formatNewsDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ja', {
      dateStyle: 'long',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function NewsList({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<NewsItem | null>(null)
  const newsQuery = useQuery({
    queryKey: ['news'],
    queryFn: () => fledgeApi.news.list(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  })

  const items = newsQuery.data ?? []
  const selectedMeta = useMemo(
    () => (selected ? parseNewsTitle(selected.title) : null),
    [selected],
  )

  return (
    <section
      className={
        compact
          ? 'flex h-full min-h-0 min-w-0 flex-col'
          : 'min-w-0'
      }
    >
      <h2 className="mb-2 shrink-0 text-xs font-medium text-[var(--color-text-muted)]">
        {t('news.title')}
      </h2>
      {newsQuery.isPending && !items.length ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t('news.loading')}</p>
      ) : !items.length ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t('news.empty')}</p>
      ) : (
        <ul
          className={
            compact
              ? 'flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5'
              : 'grid gap-2 sm:grid-cols-2'
          }
        >
          {items.map((item) => {
            const { category, label } = parseNewsTitle(item.title)
            return (
              <li key={item.id} className={compact ? 'shrink-0' : undefined}>
                <button
                  type="button"
                  className="flex h-full w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-left transition hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-hover)]/60"
                  onClick={() => setSelected(item)}
                >
                  <NewsArticleLayout
                    category={category}
                    title={label}
                    body={item.body}
                    date={formatNewsDate(item.publishedAt)}
                    mode="preview"
                  />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog
        open={Boolean(selected)}
        title={t('news.title')}
        onClose={() => setSelected(null)}
        scrollable
        fixedHeight
        size="xl"
        backdrop="lighter"
        panelClassName="w-[min(85vw,48rem)] max-w-none"
        footer={
          <>
            {selected?.url ? (
              <Button
                variant="secondary"
                className="px-4 py-2 text-base"
                onClick={() => {
                  if (selected.url) window.open(selected.url, '_blank', 'noopener,noreferrer')
                }}
              >
                {t('news.openLink')}
              </Button>
            ) : null}
            <Button variant="primary" className="px-4 py-2 text-base" onClick={() => setSelected(null)}>
              {t('common.close')}
            </Button>
          </>
        }
      >
        {selected && selectedMeta ? (
          <NewsArticleLayout
            category={selectedMeta.category}
            title={selectedMeta.label}
            body={selected.body}
            date={formatNewsDate(selected.publishedAt)}
            mode="full"
          />
        ) : null}
      </Dialog>
    </section>
  )
}
