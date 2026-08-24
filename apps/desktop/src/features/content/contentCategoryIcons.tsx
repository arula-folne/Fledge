import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconBraces,
  IconLayoutGrid,
  IconPackages,
  IconPalette,
  IconPlug,
  IconPuzzle,
  IconSparkles,
} from '@tabler/icons-react'
import type { ContentCategory } from '@fledge/shared'

type TablerIcon = ComponentType<{ size?: number; stroke?: number; className?: string }>

export const CONTENT_CATEGORY_ICONS: Record<ContentCategory, TablerIcon> = {
  mod: IconPuzzle,
  modpack: IconPackages,
  resourcepack: IconPalette,
  shader: IconSparkles,
  datapack: IconBraces,
  plugin: IconPlug,
}

const CONTENT_CATEGORY_COLORS: Record<ContentCategory, string> = {
  mod: 'text-[var(--color-category-mod)]',
  modpack: 'text-[var(--color-category-modpack)]',
  resourcepack: 'text-[var(--color-category-resourcepack)]',
  shader: 'text-[var(--color-category-shader)]',
  datapack: 'text-[var(--color-category-datapack)]',
  plugin: 'text-[var(--color-category-plugin)]',
}

export function ContentCategoryIcon({
  category,
  size = 14,
  className = '',
}: {
  category: ContentCategory
  size?: number
  className?: string
}) {
  const Icon = CONTENT_CATEGORY_ICONS[category]
  return (
    <Icon
      size={size}
      stroke={1.75}
      className={[CONTENT_CATEGORY_COLORS[category], 'shrink-0', className].join(' ')}
      aria-hidden
    />
  )
}

export function ContentCategoryLabel({
  category,
  iconSize = 14,
}: {
  category: ContentCategory
  iconSize?: number
}) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1">
      <ContentCategoryIcon category={category} size={iconSize} />
      {t(`content.category.${category}`)}
    </span>
  )
}

export function ContentFilterAllLabel({ iconSize = 14 }: { iconSize?: number }) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1">
      <IconLayoutGrid
        size={iconSize}
        stroke={1.75}
        className="shrink-0 text-[var(--color-text-muted)]"
        aria-hidden
      />
      {t('content.category.all')}
    </span>
  )
}
