import { IconCheck, IconDownload } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

const EASE = 'duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]'

type Props = {
  installing: boolean
  installed?: boolean
  onInstall: () => void
  size?: 'md' | 'sm'
  className?: string
}

const sizeClass = {
  md: 'h-9 min-w-[10rem] whitespace-nowrap px-3 text-sm',
  sm: 'min-w-[9.5rem] whitespace-nowrap px-2.5 py-1.5 text-sm',
} as const

const versionSizeClass = 'min-w-[9rem] whitespace-nowrap px-2.5 py-1 text-xs'

function InstallIcon({ installed }: { installed: boolean }) {
  return (
    <span className="relative inline-flex size-4 shrink-0 items-center justify-center" aria-hidden>
      <IconDownload
        size={16}
        stroke={1.75}
        className={[
          'absolute transition-[opacity,transform]',
          EASE,
          installed ? 'scale-75 opacity-0' : 'scale-100 opacity-100',
        ].join(' ')}
      />
      <IconCheck
        size={16}
        stroke={1.75}
        className={[
          'absolute transition-[opacity,transform]',
          EASE,
          installed ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
        ].join(' ')}
      />
    </span>
  )
}

function InstallLabel({
  installed,
  installing,
  compact,
}: {
  installed: boolean
  installing: boolean
  compact?: boolean
}) {
  const { t } = useTranslation()
  const labelClass = compact ? 'text-xs' : 'text-sm'

  return (
    <span className={['grid shrink-0 whitespace-nowrap text-center', labelClass].join(' ')}>
      <span
        className={[
          'col-start-1 row-start-1 transition-[opacity,transform]',
          EASE,
          installed ? 'pointer-events-none -translate-y-0.5 scale-95 opacity-0' : 'translate-y-0 scale-100 opacity-100',
        ].join(' ')}
      >
        {installing ? t('content.installing') : t('content.install')}
      </span>
      <span
        className={[
          'col-start-1 row-start-1 transition-[opacity,transform]',
          EASE,
          installed ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-0.5 scale-95 opacity-0',
        ].join(' ')}
      >
        {t('content.installed')}
      </span>
    </span>
  )
}

/** コンテンツのインストールボタン。押下後は滑らかに「インストール済み」へ切り替わる。 */
export function ContentInstallButton({
  installing,
  installed = false,
  onInstall,
  size = 'md',
  className = '',
}: Props) {
  const { t } = useTranslation()
  const dim = size === 'sm' ? sizeClass.sm : sizeClass.md

  return (
    <button
      type="button"
      disabled={installed || installing}
      aria-label={installed ? t('content.installed') : t('content.install')}
      aria-live="polite"
      className={[
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius-sm)] border font-medium',
        'transition-[background-color,border-color,color,opacity,box-shadow,transform]',
        EASE,
        'active:scale-[0.98] disabled:cursor-default disabled:active:scale-100',
        installed
          ? 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] opacity-80 shadow-none'
          : 'border-transparent bg-[rgb(152,196,216)] text-[rgb(36,78,102)] hover:brightness-105 disabled:opacity-50',
        dim,
        className,
      ].join(' ')}
      onClick={installed ? undefined : onInstall}
    >
      <InstallIcon installed={installed} />
      <InstallLabel installed={installed} installing={installing} />
    </button>
  )
}

export function ContentVersionInstallButton({
  installed = false,
  onInstall,
}: {
  installed?: boolean
  onInstall: () => void
}) {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      disabled={installed}
      aria-label={installed ? t('content.installed') : t('content.install')}
      aria-live="polite"
      className={[
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius-sm)] border font-medium',
        'transition-[background-color,border-color,color,opacity,transform]',
        EASE,
        'active:scale-[0.98] disabled:cursor-default disabled:active:scale-100',
        installed
          ? 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] opacity-80'
          : 'border-transparent bg-[rgb(152,196,216)] text-[rgb(36,78,102)] hover:brightness-105',
        versionSizeClass,
      ].join(' ')}
      onClick={installed ? undefined : onInstall}
    >
      <InstallIcon installed={installed} />
      <InstallLabel installed={installed} installing={false} compact />
    </button>
  )
}
