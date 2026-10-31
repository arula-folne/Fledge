import { useTranslation } from 'react-i18next'
import { IconStar } from '@tabler/icons-react'
import type { ContentCategory } from '@fledge/shared'
import { SlidingPillTabs } from '../../components/ui/SlidingPillTabs'
import type { ContentSearchTab } from './contentSearchTabs'
import { isFavoritesTab } from './contentSearchTabs'
import { ContentCategoryLabel } from './contentCategoryIcons'

type Props = {
  tabs: ContentSearchTab[]
  active: ContentSearchTab
  onChange: (tab: ContentSearchTab) => void
  onPrefetch?: (tab: ContentSearchTab) => void
}

/**
 * (お気に入り) (Modpack Mod リソースパック …)
 * 配布元は親側で上段／タイトル横に置く。
 */
export function ContentSearchCategoryTabs({ tabs, active, onChange, onPrefetch }: Props) {
  const { t } = useTranslation()
  const hasFavorites = tabs.some(isFavoritesTab)
  const categoryTabs = tabs.filter((tab): tab is ContentCategory => !isFavoritesTab(tab))
  const categoryActiveId = isFavoritesTab(active) ? '' : active

  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasFavorites ? (
        <SlidingPillTabs
          size="md"
          aria-label={t('content.category.favorites')}
          activeId={isFavoritesTab(active) ? 'favorites' : ''}
          onChange={(id) => onChange(id as ContentSearchTab)}
          items={[
            {
              id: 'favorites',
              label: (
                <span className="inline-flex items-center gap-1 leading-none">
                  <IconStar size={15} stroke={1.75} className="block shrink-0" aria-hidden />
                  <span className="leading-none">{t('content.category.favorites')}</span>
                </span>
              ),
            },
          ]}
        />
      ) : null}
      {categoryTabs.length > 0 ? (
        <SlidingPillTabs
          size="md"
          aria-label={t('content.browseTitle')}
          activeId={categoryActiveId}
          onChange={(id) => onChange(id as ContentSearchTab)}
          onPrefetch={(id) => onPrefetch?.(id as ContentSearchTab)}
          items={categoryTabs.map((tab) => ({
            id: tab,
            label: <ContentCategoryLabel category={tab} iconSize={15} />,
          }))}
        />
      ) : null}
    </div>
  )
}
