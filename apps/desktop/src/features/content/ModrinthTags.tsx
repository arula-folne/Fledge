import type { ComponentType, ReactNode } from 'react'
import {
  IconApple,
  IconBolt,
  IconBooks,
  IconBox,
  IconBug,
  IconCar,
  IconCoin,
  IconCompass,
  IconCpu,
  IconDeviceDesktop,
  IconDice,
  IconMountain,
  IconPalette,
  IconServer,
  IconSkull,
  IconSword,
  IconTool,
  IconUsers,
  IconWand,
} from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

/** Modrinth ライトテーマのプラットフォーム色に寄せる */
const LOADER_COLOR: Record<string, string> = {
  fabric: '#8a7b71',
  forge: '#5b6197',
  neoforge: '#dc895c',
  quilt: '#8b61b4',
  bukkit: '#e78362',
  paper: '#e67e7e',
  purpur: '#7763a3',
  spigot: '#cd7a21',
  folia: '#6aa54f',
  sponge: '#c49528',
  bungeecord: '#c69e39',
  velocity: '#4b98b0',
  waterfall: '#5f83cb',
}

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

const CATEGORY_COLOR: Record<string, string> = {
  adventure: '#ff9b2f',
  cursed: '#b54bf3',
  decoration: '#ff70b5',
  economy: '#3ebf6e',
  equipment: '#55b2e8',
  food: '#e07a3d',
  'game-mechanics': '#1fc7c7',
  library: '#7a8494',
  magic: '#c74eed',
  management: '#6b8afd',
  minigame: '#f0c040',
  mobs: '#e35d6a',
  optimization: '#1bd96a',
  social: '#5b9dff',
  storage: '#c4a35a',
  technology: '#4aa3df',
  transportation: '#5d9c3f',
  utility: '#4c8eda',
  worldgen: '#3d9a6a',
}

const CATEGORY_ICON: Record<string, ComponentType<{ size?: number; stroke?: number; style?: object }>> = {
  adventure: IconCompass,
  cursed: IconSkull,
  decoration: IconPalette,
  economy: IconCoin,
  equipment: IconSword,
  food: IconApple,
  'game-mechanics': IconCpu,
  library: IconBooks,
  magic: IconWand,
  management: IconTool,
  minigame: IconDice,
  mobs: IconBug,
  optimization: IconBolt,
  social: IconUsers,
  storage: IconBox,
  technology: IconCpu,
  transportation: IconCar,
  utility: IconTool,
  worldgen: IconMountain,
}

const TAG_I18N = new Set(Object.keys(CATEGORY_COLOR))

export const LOADER_IDS = new Set(Object.keys(LOADER_COLOR))

type Side = 'required' | 'optional' | 'unsupported' | undefined

function sideColor(side: Side): string {
  if (side === 'required') return '#1bd96a'
  if (side === 'optional') return '#8b8f97'
  return '#ff496e'
}

export function EnvironmentIcons({
  client,
  server,
}: {
  client?: Side
  server?: Side
}) {
  const { t } = useTranslation()
  if (!client && !server) return null
  const showClient = client && client !== 'unsupported'
  const showServer = server && server !== 'unsupported'
  if (!showClient && !showServer) return null

  const title = [
    showClient ? t(client === 'required' ? 'content.env.clientRequired' : 'content.env.clientOptional') : null,
    showServer ? t(server === 'required' ? 'content.env.serverRequired' : 'content.env.serverOptional') : null,
  ]
    .filter(Boolean)
    .join(' / ')

  return (
    <span className="inline-flex items-center gap-0.5" title={title}>
      {showClient ? (
        <IconDeviceDesktop size={14} stroke={1.8} style={{ color: sideColor(client) }} />
      ) : null}
      {showServer ? (
        <IconServer size={14} stroke={1.8} style={{ color: sideColor(server) }} />
      ) : null}
    </span>
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
  const rows: Array<{ key: string; side: Side; label: string; icon: ReactNode }> = [
    {
      key: 'client',
      side: client,
      label: t('content.env.client'),
      icon: <IconDeviceDesktop size={16} stroke={1.8} />,
    },
    {
      key: 'server',
      side: server,
      label: t('content.env.server'),
      icon: <IconServer size={16} stroke={1.8} />,
    },
  ]
  return (
    <div className="space-y-1.5">
      {rows.map((row) => {
        if (!row.side || row.side === 'unsupported') return null
        const color = sideColor(row.side)
        return (
          <div key={row.key} className="flex items-center justify-between gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 text-[var(--color-text)]">
              <span style={{ color }}>{row.icon}</span>
              {row.label}
            </span>
            <span className="text-xs font-semibold" style={{ color }}>
              {row.side === 'required' ? t('content.env.required') : t('content.env.optional')}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function loaderLabel(loader: string): string {
  return LOADER_LABEL[loader.toLowerCase()] ?? loader
}

export function loaderColor(loader: string): string {
  return LOADER_COLOR[loader.toLowerCase()] ?? 'var(--color-text-muted)'
}

export function CategoryChip({ tag }: { tag: string }) {
  const { t } = useTranslation()
  const color = CATEGORY_COLOR[tag] ?? '#7a8494'
  const Icon = CATEGORY_ICON[tag]
  const label = TAG_I18N.has(tag)
    ? t(`content.tag.${tag}` as 'content.tag.library')
    : tag.replace(/-/g, ' ')
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium"
      style={{ color, background: `${color}22` }}
    >
      {Icon ? <Icon size={11} stroke={1.8} style={{ color }} /> : null}
      {label}
    </span>
  )
}

export function LoaderChip({ loader }: { loader: string }) {
  const id = loader.toLowerCase()
  const color = LOADER_COLOR[id] ?? 'var(--color-text-muted)'
  const label = LOADER_LABEL[id] ?? loader
  return (
    <span className="text-[11px] font-semibold" style={{ color }}>
      {label}
    </span>
  )
}

export function ProjectTagRow({
  clientSide,
  serverSide,
  categories,
  loaders,
  maxCategories = 3,
}: {
  clientSide?: Side
  serverSide?: Side
  categories: string[]
  loaders: string[]
  maxCategories?: number
}) {
  const tags = categories.filter((tag) => !LOADER_IDS.has(tag)).slice(0, maxCategories)
  const shownLoaders = (loaders.length ? loaders : categories.filter((tag) => LOADER_IDS.has(tag))).slice(
    0,
    4,
  )
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <EnvironmentIcons client={clientSide} server={serverSide} />
      {tags.map((tag) => (
        <CategoryChip key={tag} tag={tag} />
      ))}
      {shownLoaders.map((loader) => (
        <LoaderChip key={loader} loader={loader} />
      ))}
    </div>
  )
}
