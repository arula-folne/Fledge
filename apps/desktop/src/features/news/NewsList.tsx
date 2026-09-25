import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { NewsItem } from '@fledge/shared'
import { IconChevronRight } from '@tabler/icons-react'
import { fledgeApi } from '../../api/fledgeApi'
import { Dialog } from '../../components/ui/Dialog'
import { Button } from '../../components/ui/Button'
import { HoverTip } from '../../components/ui/HoverTip'
import { NewsArticleLayout } from './NewsArticleLayout'
import { NewsCategoryBadge } from './NewsCategoryBadge'
import { parseNewsTitle } from './newsFormat'

const HOME_NEWS_MAX = 10

/** お知らせポップアップ: アプリ窓に対して幅・高さとも 80% */
const NEWS_DIALOG_PANEL_CLASS = [
  '!flex shrink-0 flex-col overflow-hidden',
  '!h-[80vh] !max-h-[80vh] !w-[80vw] !max-w-[80vw]',
].join(' ')

function formatNewsDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ja', {
      dateStyle: 'long',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function NewsItemButton({
  item,
  onSelect,
}: {
  item: NewsItem
  onSelect: (item: NewsItem) => void
}) {
  const { category, label } = parseNewsTitle(item.title)
  return (
    <button
      type="button"
      className="flex h-full w-full rounded-[var(--radius-sm)] border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/8 px-[var(--news-card-px)] py-[var(--news-card-py)] text-left transition hover:border-[var(--color-accent)]/35 hover:bg-[var(--color-accent)]/14"
      onClick={() => onSelect(item)}
    >
      <NewsArticleLayout
        category={category}
        title={label}
        body={item.body}
        date={formatNewsDate(item.publishedAt)}
        mode="preview"
      />
    </button>
  )
}

function NewsArchiveListItem({
  item,
  selected,
  onSelect,
}: {
  item: NewsItem
  selected: boolean
  onSelect: (item: NewsItem) => void
}) {
  const { category, label } = parseNewsTitle(item.title)
  return (
    <button
      type="button"
      className={[
        'w-full rounded-[var(--radius-sm)] border px-2 py-2 text-left transition',
        selected
          ? 'border-[var(--color-accent)]/35 bg-[var(--color-accent)]/12'
          : 'border-transparent hover:border-[var(--color-accent)]/20 hover:bg-[var(--color-accent)]/8',
      ].join(' ')}
      onClick={() => onSelect(item)}
    >
      <div className="flex flex-col gap-1">
        {category ? <NewsCategoryBadge category={category} className="self-start scale-90 origin-left" /> : null}
        <span className="line-clamp-2 text-xs font-medium leading-snug text-[var(--color-text)]">
          {label}
        </span>
        <span className="text-[10px] tabular-nums text-[var(--color-text-muted)]">
          {formatNewsDate(item.publishedAt)}
        </span>
      </div>
    </button>
  )
}

function NewsArchiveDialog({
  open,
  items,
  onClose,
}: {
  open: boolean
  items: NewsItem[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [active, setActive] = useState<NewsItem | null>(null)

  useEffect(() => {
    if (!open) {
      setActive(null)
      return
    }
    setActive(items[0] ?? null)
  }, [open, items])

  const activeMeta = useMemo(() => (active ? parseNewsTitle(active.title) : null), [active])

  return (
    <Dialog
      open={open}
      title={t('news.archiveTitle')}
      onClose={onClose}
      compact
      fixedHeight
      scrollable={false}
      size="xl"
      backdrop="lighter"
      panelClassName={NEWS_DIALOG_PANEL_CLASS}
      contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
      footer={
        <>
          {active?.url ? (
            <Button
              variant="secondary"
              className="text-xs"
              onClick={() => {
                if (active.url) window.open(active.url, '_blank', 'noopener,noreferrer')
              }}
            >
              {t('news.openLink')}
            </Button>
          ) : null}
          <Button variant="primary" className="text-xs" onClick={onClose}>
            {t('common.close')}
          </Button>
        </>
      }
    >
      {items.length === 0 ? (
        <p className="text-xs text-[var(--color-text-muted)]">{t('news.empty')}</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,2fr)_minmax(0,8fr)] grid-rows-[minmax(0,1fr)] divide-x divide-[var(--color-border)]">
          <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto pr-2">
            {items.map((item) => (
              <li key={item.id}>
                <NewsArchiveListItem
                  item={item}
                  selected={active?.id === item.id}
                  onSelect={setActive}
                />
              </li>
            ))}
          </ul>
          <div className="min-h-0 overflow-y-auto overscroll-contain pl-3 pr-0.5 pb-1">
            {active && activeMeta ? (
              <NewsArticleLayout
                category={activeMeta.category}
                title={activeMeta.label}
                body={active.body}
                date={formatNewsDate(active.publishedAt)}
                mode="full"
                compact
              />
            ) : null}
          </div>
        </div>
      )}
    </Dialog>
  )
}

function NewsDetailDialog({
  item,
  onClose,
}: {
  item: NewsItem | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const meta = useMemo(() => (item ? parseNewsTitle(item.title) : null), [item])

  return (
    <Dialog
      open={Boolean(item)}
      title={t('news.title')}
      onClose={onClose}
      scrollable
      fixedHeight
      compact
      size="xl"
      backdrop="lighter"
      overlayClassName="z-[90]"
      panelClassName={NEWS_DIALOG_PANEL_CLASS}
      contentClassName="min-h-0 flex-1 overflow-y-auto"
      footer={
        <>
          {item?.url ? (
            <Button
              variant="secondary"
              className="text-xs"
              onClick={() => {
                if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer')
              }}
            >
              {t('news.openLink')}
            </Button>
          ) : null}
          <Button variant="primary" className="text-xs" onClick={onClose}>
            {t('common.close')}
          </Button>
        </>
      }
    >
      {item && meta ? (
        <NewsArticleLayout
          category={meta.category}
          title={meta.label}
          body={item.body}
          date={formatNewsDate(item.publishedAt)}
          mode="full"
          compact
        />
      ) : null}
    </Dialog>
  )
}

export function NewsList({
  compact = false,
  showMinimize = false,
}: {
  compact?: boolean
  /** ホーム右カラム: タイトル横に最小化ボタン */
  showMinimize?: boolean
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<NewsItem | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const newsQuery = useQuery({
    queryKey: ['news'],
    queryFn: () => fledgeApi.news.list(),
    staleTime: 5 * 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60_000,
  })

  const hideMutation = useMutation({
    mutationFn: () => fledgeApi.settings.set({ homeNewsVisible: false }),
    onSuccess: async (next) => {
      queryClient.setQueryData(['settings'], next)
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const items = newsQuery.data ?? []
  const homeItems = compact ? items.slice(0, HOME_NEWS_MAX) : items
  const showViewAll = compact && items.length > 0

  return (
    <section
      data-fledge-tutorial="tutorial-home-news"
      className={
        compact
          ? 'flex h-full min-h-0 min-w-0 flex-col'
          : 'min-w-0'
      }
    >
      <div className="mb-2 flex shrink-0 items-center gap-1">
        <h2 className="min-w-0 flex-1 text-[length:var(--news-section-title)] font-medium text-[var(--color-accent)]">
          {t('news.title')}
        </h2>
        {showMinimize ? (
          <HoverTip label={t('news.minimize')}>
            <button
              type="button"
              className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[var(--color-accent)]/70 transition hover:bg-[var(--color-accent)]/12 hover:text-[var(--color-accent)]"
              aria-label={t('news.minimize')}
              disabled={hideMutation.isPending}
              onClick={() => hideMutation.mutate()}
            >
              <IconChevronRight size={20} stroke={1.75} aria-hidden />
            </button>
          </HoverTip>
        ) : null}
      </div>
      {newsQuery.isPending && !items.length ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t('news.loading')}</p>
      ) : !items.length ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t('news.empty')}</p>
      ) : (
        <ul
          className={
            compact
              ? 'flex min-h-0 flex-1 flex-col gap-[var(--news-list-gap)] overflow-y-auto pr-0.5'
              : 'grid gap-2 sm:grid-cols-2'
          }
        >
          {homeItems.map((item) => (
            <li key={item.id} className={compact ? 'shrink-0' : undefined}>
              <NewsItemButton item={item} onSelect={setSelected} />
            </li>
          ))}
        </ul>
      )}

      {showViewAll ? (
        <div className="mt-auto shrink-0 pt-2 pr-0.5">
          <button
            type="button"
            className="flex min-h-[var(--news-view-all-min-h)] w-full items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/8 py-[var(--news-card-py)] text-[length:var(--news-preview-body)] font-medium text-[var(--color-accent)] transition hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent)]/14"
            onClick={() => setArchiveOpen(true)}
          >
            {t('news.viewAll')}
          </button>
        </div>
      ) : null}

      <NewsArchiveDialog open={archiveOpen} items={items} onClose={() => setArchiveOpen(false)} />

      <NewsDetailDialog item={selected} onClose={() => setSelected(null)} />
    </section>
  )
}
