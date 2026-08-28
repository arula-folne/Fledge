import { useTranslation } from 'react-i18next'
import type { ContentSearchTab } from './contentSearchTabs'
import { isFavoritesTab } from './contentSearchTabs'
import { ContentCategoryLabel } from './contentCategoryIcons'
import { IconStar } from '@tabler/icons-react'

type Props = {
  tabs: ContentSearchTab[]
  active: ContentSearchTab
  onChange: (tab: ContentSearchTab) => void
  onPrefetch?: (tab: ContentSearchTab) => void
}

export function ContentSearchCategoryTabs({ tabs, active, onChange, onPrefetch }: Props) {
  const { t } = useTranslation()

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      {tabs.map((tab) => {
        const selected = tab === active
        return (
          <button
            key={tab}
            type="button"
            onMouseEnter={() => onPrefetch?.(tab)}
            onFocus={() => onPrefetch?.(tab)}
            onClick={() => {
              if (selected) return
              onChange(tab)
            }}
            className={[
              'inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium transition-colors',
              selected
                ? 'bg-[var(--color-selection)] text-[var(--color-on-selection)]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)]',
            ].join(' ')}
          >
            {isFavoritesTab(tab) ? (
              <span className="inline-flex items-center gap-1">
                <IconStar size={15} stroke={1.75} className="shrink-0" aria-hidden />
                {t('content.category.favorites')}
              </span>
            ) : (
              <ContentCategoryLabel category={tab} iconSize={15} />
            )}
          </button>
        )
      })}
    </div>
  )
}
