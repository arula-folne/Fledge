import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { modrinthCategoryLabel } from '@fledge/i18n'

const LOADER_LABEL: Record<string, string> = {
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt',
  bukkit: 'Bukkit',
  paper: 'Paper',
  purpur: 'Purpur',
  spigot: 'Spigot',
  folia: 'Folia',
  sponge: 'Sponge',
  bungeecord: 'BungeeCord',
  velocity: 'Velocity',
  waterfall: 'Waterfall',
}

export const LOADER_IDS = new Set(Object.keys(LOADER_LABEL))

const LOADER_COLOR_CLASS: Record<string, string> = {
  fabric: 'text-[var(--color-loader-fabric)]',
  forge: 'text-[var(--color-loader-forge)]',
  neoforge: 'text-[var(--color-loader-neoforge)]',
  quilt: 'text-[var(--color-loader-quilt)]',
}

export function loaderLabel(loader: string): string {
  return LOADER_LABEL[loader.toLowerCase()] ?? loader
}

export function loaderColorClass(loader: string): string {
  return LOADER_COLOR_CLASS[loader.toLowerCase()] ?? 'text-[var(--color-text-muted)]'
}

export function LoaderText({
  loader,
  className = '',
}: {
  loader: string
  className?: string
}) {
  return (
    <span className={[loaderColorClass(loader), 'font-medium', className].join(' ')}>
      {loaderLabel(loader)}
    </span>
  )
}

export function LoaderInlineList({
  loaders,
  className = '',
}: {
  loaders: string[]
  className?: string
}) {
  if (!loaders.length) return null
  return (
    <span className={['inline', className].join(' ')}>
      {loaders.map((loader, index) => (
        <Fragment key={`${loader}-${index}`}>
          {index > 0 ? <span className="text-[var(--color-text-muted)]"> · </span> : null}
          <LoaderText loader={loader} />
        </Fragment>
      ))}
    </span>
  )
}

export const MOD_TAG_IDS = [
  'adventure',
  'cursed',
  'decoration',
  'economy',
  'equipment',
  'food',
  'game-mechanics',
  'library',
  'magic',
  'management',
  'minigame',
  'mobs',
  'optimization',
  'social',
  'storage',
  'technology',
  'transportation',
  'utility',
  'worldgen',
] as const

export const RESOURCEPACK_TAG_IDS = [
  '16x',
  '32x',
  '64x',
  '128x',
  '256x',
  '512x+',
  '8x-',
  '48x',
  'audio',
  'blocks',
  'combat',
  'core-shaders',
  'cursed',
  'decoration',
  'entities',
  'environment',
  'equipment',
  'fonts',
  'gui',
  'items',
  'locale',
  'modded',
  'models',
  'realistic',
  'simplistic',
  'themed',
  'tweaks',
  'utility',
  'vanilla-like',
] as const

export const SHADER_TAG_IDS = [
  'atmosphere',
  'bloom',
  'cartoon',
  'colored-lighting',
  'cursed',
  'fantasy',
  'foliage',
  'high',
  'low',
  'medium',
  'path-tracing',
  'pbr',
  'potato',
  'realistic',
  'reflections',
  'screenshot',
  'semi-realistic',
  'shadows',
  'vanilla-like',
] as const

export function filterTagsForCategory(category: string): readonly string[] {
  if (category === 'resourcepack') return RESOURCEPACK_TAG_IDS
  if (category === 'shader') return SHADER_TAG_IDS
  return MOD_TAG_IDS
}

type Side = 'required' | 'optional' | 'unsupported' | undefined

/** Modrinth Crowdin のカテゴリ名。未対応言語は en-US、それも無ければ ID を読みやすくした文字列。 */
export function tagLabel(tag: string, locale: string): string {
  return modrinthCategoryLabel(locale, tag) ?? tag.replace(/-/g, ' ')
}

export function TagIcon({ icon, className = '' }: { icon?: string; className?: string }) {
  if (!icon?.trim()) return null
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center justify-center text-[var(--color-text-muted)]',
        '[&_svg]:size-3.5',
        className,
      ].join(' ')}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: icon }}
    />
  )
}

export function EnvironmentPanel({
  client,
  server,
}: {
  client?: Side
  server?: Side
}) {
  const { t } = useTranslation()
  const rows: Array<{ key: string; side: Side; label: string }> = [
    { key: 'client', side: client, label: t('content.env.client') },
    { key: 'server', side: server, label: t('content.env.server') },
  ]
  return (
    <ul className="space-y-1 text-xs">
      {rows.map((row) => {
        if (!row.side || row.side === 'unsupported') return null
        return (
          <li key={row.key} className="flex justify-between gap-2">
            <span>{row.label}</span>
            <span className="text-[var(--color-text-muted)]">
              {row.side === 'required' ? t('content.env.required') : t('content.env.optional')}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function ProjectTagRow({
  categories,
  loaders,
  maxCategories = 3,
  tagIcons,
}: {
  clientSide?: Side
  serverSide?: Side
  categories: string[]
  loaders: string[]
  maxCategories?: number
  tagIcons?: Map<string, string>
}) {
  const { i18n } = useTranslation()
  const tags = categories.filter((tag) => !LOADER_IDS.has(tag)).slice(0, maxCategories)
  const shownLoaders = (loaders.length ? loaders : categories.filter((tag) => LOADER_IDS.has(tag))).slice(
    0,
    3,
  )
  if (!shownLoaders.length && !tags.length) return null
  return (
    <p className="truncate text-xs text-[var(--color-text-muted)]">
      <LoaderInlineList loaders={shownLoaders} />
      {shownLoaders.length && tags.length ? (
        <span className="text-[var(--color-text-muted)]"> · </span>
      ) : null}
      {tags.map((tag, index) => (
        <Fragment key={tag}>
          {index > 0 ? <span className="text-[var(--color-text-muted)]"> · </span> : null}
          <span className="inline-flex items-center gap-0.5">
            <TagIcon icon={tagIcons?.get(tag)} className="[&_svg]:size-3" />
            {tagLabel(tag, i18n.language)}
          </span>
        </Fragment>
      ))}
    </p>
  )
}
