import type { Loader } from '@fledge/shared'
import {
  IconBox,
  IconBrandMinecraft,
  IconCube,
  IconLayersIntersect,
} from '@tabler/icons-react'

const loaderTone: Record<Loader, string> = {
  vanilla: 'from-emerald-600/40 to-emerald-900/50',
  fabric: 'from-sky-500/40 to-indigo-900/50',
  forge: 'from-amber-600/40 to-orange-950/50',
  neoforge: 'from-orange-500/40 to-red-950/50',
}

function LoaderGlyph({ loader }: { loader: Loader }) {
  const props = { size: 28, stroke: 1.6 } as const
  switch (loader) {
    case 'fabric':
      return <IconLayersIntersect {...props} />
    case 'forge':
    case 'neoforge':
      return <IconCube {...props} />
    default:
      return <IconBrandMinecraft {...props} />
  }
}

type Props = {
  loader: Loader
  size?: 'md' | 'lg'
  className?: string
}

/** ローダー別のプレースホルダアイコン */
export function InstanceIcon({ loader, size = 'md', className = '' }: Props) {
  const dim = size === 'lg' ? 'size-16' : 'size-12'
  return (
    <div
      className={[
        dim,
        'flex shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-gradient-to-br text-white shadow-inner',
        loaderTone[loader] ?? 'from-slate-600/40 to-slate-900/50',
        className,
      ].join(' ')}
      aria-hidden
    >
      {loaderTone[loader] ? <LoaderGlyph loader={loader} /> : <IconBox size={28} stroke={1.6} />}
    </div>
  )
}
