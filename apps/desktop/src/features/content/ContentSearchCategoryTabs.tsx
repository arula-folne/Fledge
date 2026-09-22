import { useTranslation } from 'react-i18next'
import { IconStar } from '@tabler/icons-react'
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

export function ContentSearchCategoryTabs({ tabs, active, onChange, onPrefetch }: Props) {
  const { t } = useTranslation()

  return (
    <SlidingPillTabs
      size="md"
      activeId={active}
      onChange={(id) => onChange(id as ContentSearchTab)}
      onPrefetch={(id) => onPrefetch?.(id as ContentSearchTab)}
      items={tabs.map((tab) => ({
        id: tab,
        label: isFavoritesTab(tab) ? (
          <span className="inline-flex items-center gap-1">
            <IconStar size={15} stroke={1.75} className="shrink-0" aria-hidden />
            {t('content.category.favorites')}
          </span>
        ) : (
          <ContentCategoryLabel category={tab} iconSize={15} />
        ),
      }))}
    />
  )
}
