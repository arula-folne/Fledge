import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconAdjustmentsHorizontal, IconSearch } from '@tabler/icons-react'
import type { ContentCategory, ContentLoaderFilter, InstanceProfile } from '@fledge/shared'
import { filterTagsForCategory, LoaderText, TagIcon, tagLabel } from './ContentTags'
import { useModrinthTagIcons } from './useModrinthTagIcons'

const LOADERS: ContentLoaderFilter[] = ['fabric', 'forge', 'neoforge', 'quilt']

type Props = {
  /** 省略時はインスタンス版バッジを出さない（閲覧画面） */
  instance?: InstanceProfile
  category: ContentCategory
  gameVersion: string
  loaders: ContentLoaderFilter[]
  tags: string[]
  versionOptions: string[]
  onGameVersion: (next: string) => void
  onLoaders: (next: ContentLoaderFilter[]) => void
  onTags: (next: string[]) => void
  onReset: () => void
}

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

const rowClass = (active: boolean) =>
  [
    'flex w-full items-center rounded px-2 py-1 text-left text-[0.95em] leading-snug transition-colors',
    active
      ? 'bg-[var(--color-selection-soft)] font-medium text-[var(--color-selection)]'
      : 'text-[var(--color-text)] hover:bg-[var(--color-hover)]',
  ].join(' ')

function FilterBlock({
  title,
  extra,
  compact,
  children,
}: {
  title: string
  extra?: ReactNode
  compact?: boolean
  children: ReactNode
}) {
  return (
    <section
      className={[
        'flex min-w-0 flex-col rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1.5',
        compact ? 'shrink-0' : 'min-h-0 flex-1',
      ].join(' ')}
    >
      <h4 className="mb-1 shrink-0 text-[0.85em] font-semibold tracking-wide text-[var(--color-text-muted)]">
        {title}
      </h4>
      {extra}
      <div className={compact ? '' : 'min-h-0 flex-1 overflow-y-auto pr-0.5'}>{children}</div>
    </section>
  )
}

export function ContentBrowseFilters({
  instance,
  category,
  gameVersion,
  loaders,
  tags,
  versionOptions,
  onGameVersion,
  onLoaders,
  onTags,
  onReset,
}: Props) {
  const { t, i18n } = useTranslation()
  const [versionQuery, setVersionQuery] = useState('')
  const showLoaders = category === 'mod' || category === 'plugin' || category === 'modpack'
  const availableTags = useMemo(() => filterTagsForCategory(category), [category])
  const iconByTag = useModrinthTagIcons(category)
  const filteredVersions = useMemo(() => {
    const q = versionQuery.trim().toLowerCase()
    if (!q) return versionOptions
    return versionOptions.filter((id) => id.toLowerCase().includes(q))
  }, [versionOptions, versionQuery])

  return (
    <aside
      className={[
        '@container/filter flex min-h-0 w-[25%] min-w-44 max-w-72 shrink-0 flex-col gap-1 overflow-hidden',
        'rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-2',
        'text-[clamp(11px,3cqi,14px)] [container-type:inline-size]',
      ].join(' ')}
    >
      <div className="flex shrink-0 items-center justify-between gap-1 py-0.5">
        <h3 className="flex items-center gap-1 text-[1.05em] font-semibold leading-none text-[var(--color-text)]">
          <IconAdjustmentsHorizontal
            stroke={1.7}
            className="size-[1.15em] shrink-0 text-[var(--color-text-muted)]"
            aria-hidden
          />
          {t('content.filter.title')}
        </h3>
        <button
          type="button"
          className="rounded px-1 py-0.5 text-[0.9em] leading-none text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
          onClick={onReset}
        >
          {t('content.filter.reset')}
        </button>
      </div>

      <FilterBlock
        title={t('content.filter.gameVersion')}
        extra={
          <div className="relative mb-1 shrink-0">
            <IconSearch
              stroke={1.75}
              className="pointer-events-none absolute left-1.5 top-1/2 size-[1em] -translate-y-1/2 text-[var(--color-text-muted)]"
            />
            <input
              value={versionQuery}
              onChange={(e) => setVersionQuery(e.target.value)}
              placeholder={t('content.filter.versionSearch')}
              className="w-full rounded border border-[var(--color-border)] bg-[var(--color-input)] py-1 pl-[1.75em] pr-1.5 text-[0.95em] outline-none focus:border-[var(--color-accent)]"
            />
          </div>
        }
      >
        <button type="button" className={rowClass(gameVersion === '')} onClick={() => onGameVersion('')}>
          {t('content.filter.anyVersion')}
        </button>
        {filteredVersions.map((id) => {
          const current = instance ? id === instance.minecraftVersion : false
          return (
            <button
              key={id}
              type="button"
              className={rowClass(gameVersion === id)}
              onClick={() => onGameVersion(id)}
            >
              <span className="min-w-0 truncate">{id}</span>
              {current ? (
                <span className="ml-auto shrink-0 pl-1 text-[0.8em] text-[var(--color-text-muted)]">
                  {t('content.filter.instanceVersion')}
                </span>
              ) : null}
            </button>
          )
        })}
      </FilterBlock>

      {showLoaders ? (
        <FilterBlock title={t('content.filter.loader')} compact>
          <div className="grid grid-cols-2 gap-0.5">
            {LOADERS.map((loader) => {
              const checked = loaders.includes(loader)
              return (
                <label key={loader} className={`${rowClass(checked)} cursor-pointer`}>
                  <input
                    type="checkbox"
                    className="mr-1 size-[1.05em] shrink-0"
                    checked={checked}
                    onChange={() => onLoaders(toggleValue(loaders, loader))}
                  />
                  <LoaderText loader={loader} />
                </label>
              )
            })}
          </div>
        </FilterBlock>
      ) : null}

      <FilterBlock title={t('content.filter.category')}>
        {availableTags.map((tag) => {
          const checked = tags.includes(tag)
          return (
            <label key={tag} className={`${rowClass(checked)} cursor-pointer gap-1`}>
              <input
                type="checkbox"
                className="mr-1 size-[1.05em] shrink-0"
                checked={checked}
                onChange={() => onTags(toggleValue(tags, tag))}
              />
              <TagIcon icon={iconByTag.get(tag)} className="[&_svg]:size-[1.05em]" />
              <span className="min-w-0 truncate">{tagLabel(tag, i18n.language)}</span>
            </label>
          )
        })}
      </FilterBlock>
    </aside>
  )
}
