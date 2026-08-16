import { BRAND } from '@fledge/shared'
import folneLogo from '../../assets/folne-logo.png'

type Props = {
  /** 折りたたみサイドバー向け */
  compact?: boolean
  /** サイドバーはテキストのみ */
  size?: 'default' | 'sidebar'
  className?: string
}

export function AppCredits({ compact = false, size = 'default', className = '' }: Props) {
  if (size === 'sidebar') {
    return (
      <div
        className={['min-w-0', compact ? 'text-center' : '', className].filter(Boolean).join(' ')}
      >
        <p
          className={[
            'leading-snug font-normal text-[var(--color-text-muted)]',
            compact ? 'text-[10px]' : 'text-sm',
          ].join(' ')}
        >
          {compact ? BRAND.name : BRAND.versionFull}
        </p>
        <p
          className={[
            'mt-0.5 font-normal text-[var(--color-text-muted)]',
            compact ? 'text-[10px]' : 'text-xs',
          ].join(' ')}
        >
          {compact ? `Ver.${BRAND.versionShort}` : BRAND.developedBy}
        </p>
      </div>
    )
  }

  return (
    <div className={className}>
      <p className="text-lg font-semibold tracking-wide text-[var(--color-text)]">
        {BRAND.versionFull}
      </p>
      <div className="mt-4 flex items-center gap-2">
        <span className="text-sm text-[var(--color-text-muted)]">Developed by</span>
        <img
          src={folneLogo}
          alt={BRAND.author}
          className="h-6 w-auto max-w-[9rem] object-contain object-left"
          draggable={false}
        />
      </div>
    </div>
  )
}
