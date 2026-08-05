import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { NewsItem } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { Dialog } from '../../components/ui/Dialog'
import { Button } from '../../components/ui/Button'

function formatNewsDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ja', {
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function NewsList() {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<NewsItem | null>(null)
  const newsQuery = useQuery({
    queryKey: ['news'],
    queryFn: () => fledgeApi.news.list(),
  })

  const items = newsQuery.data ?? []

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-[var(--color-text-muted)]">{t('news.title')}</h2>
      {!items.length ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t('news.empty')}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex h-full w-full flex-col rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-left transition duration-200 hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-hover)]/40"
                onClick={() => setSelected(item)}
              >
                <div className="font-medium text-[var(--color-text)]">{item.title}</div>
                <p className="mt-1 line-clamp-2 text-sm text-[var(--color-text-muted)]">
                  {item.body}
                </p>
                <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                  {formatNewsDate(item.publishedAt)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={Boolean(selected)}
        title={selected?.title ?? ''}
        subtitle={selected ? formatNewsDate(selected.publishedAt) : undefined}
        onClose={() => setSelected(null)}
        scrollable
        footer={
          <>
            {selected?.url ? (
              <Button
                variant="secondary"
                onClick={() => {
                  if (selected.url) window.open(selected.url, '_blank', 'noopener,noreferrer')
                }}
              >
                {t('news.openLink')}
              </Button>
            ) : null}
            <Button variant="primary" onClick={() => setSelected(null)}>
              {t('common.close')}
            </Button>
          </>
        }
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text)]">
          {selected?.body}
        </p>
      </Dialog>
    </section>
  )
}
