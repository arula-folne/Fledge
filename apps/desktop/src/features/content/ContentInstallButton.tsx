import { IconCheck, IconDownload } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

const EASE = 'duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]'

type Props = {
  installing: boolean
  installed?: boolean
  disabled?: boolean
  onInstall: () => void
  size?: 'md' | 'sm'
  className?: string
  /** install=既存インスタンスへ導入 / create=新規インスタンス作成 */
  mode?: 'install' | 'create'
}

const sizeClass = {
  md: 'h-11 min-w-[10rem] whitespace-nowrap px-3 text-sm',
  sm: 'h-10 min-w-[9.5rem] whitespace-nowrap px-2.5 text-sm',
} as const

const versionSizeClass = 'h-9 min-w-[9rem] whitespace-nowrap px-2.5 text-xs'

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
  mode,
}: {
  installed: boolean
  installing: boolean
  compact?: boolean
  mode: 'install' | 'create'
}) {
  const { t } = useTranslation()
  const labelClass = compact ? 'text-xs' : 'text-sm'
  const idleLabel = mode === 'create' ? t('content.createInstance') : t('content.install')
  const busyLabel = mode === 'create' ? t('content.creatingInstance') : t('content.installing')
  const doneLabel = mode === 'create' ? t('content.createInstance') : t('content.installed')

  return (
    <span className={['grid shrink-0 whitespace-nowrap text-center', labelClass].join(' ')}>
      <span
        className={[
          'col-start-1 row-start-1 transition-[opacity,transform]',
          EASE,
          installed ? 'pointer-events-none -translate-y-0.5 scale-95 opacity-0' : 'translate-y-0 scale-100 opacity-100',
        ].join(' ')}
      >
        {installing ? busyLabel : idleLabel}
      </span>
      <span
        className={[
          'col-start-1 row-start-1 transition-[opacity,transform]',
          EASE,
          installed ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-0.5 scale-95 opacity-0',
        ].join(' ')}
      >
        {doneLabel}
      </span>
    </span>
  )
}

/** コンテンツのインストール / インスタンス作成ボタン */
export function ContentInstallButton({
  installing,
  installed = false,
  disabled = false,
  onInstall,
  size = 'md',
  className = '',
  mode = 'install',
}: Props) {
  const { t } = useTranslation()
  const dim = size === 'sm' ? sizeClass.sm : sizeClass.md
  const aria =
    mode === 'create'
      ? t('content.createInstance')
      : installed
        ? t('content.installed')
        : t('content.install')

  return (
    <button
      type="button"
      disabled={disabled || installed || installing}
      aria-label={aria}
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
      onClick={disabled || installed ? undefined : onInstall}
    >
      <InstallIcon installed={installed} />
      <InstallLabel installed={installed} installing={installing} mode={mode} />
    </button>
  )
}

export function ContentVersionInstallButton({
  installed = false,
  onInstall,
  mode = 'install',
  installing = false,
}: {
  installed?: boolean
  onInstall: () => void
  mode?: 'install' | 'create'
  installing?: boolean
}) {
  const { t } = useTranslation()
  const aria =
    mode === 'create'
      ? t('content.createInstance')
      : installed
        ? t('content.installed')
        : t('content.install')

  return (
    <button
      type="button"
      disabled={installed || installing}
      aria-label={aria}
      aria-live="polite"
      className={[
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius-sm)] border font-medium',
        'transition-[background-color,border-color,color,opacity,transform]',
        EASE,
        'active:scale-[0.98] disabled:cursor-default disabled:active:scale-100',
        installed
          ? 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] opacity-80'
          : 'border-transparent bg-[rgb(152,196,216)] text-[rgb(36,78,102)] hover:brightness-105 disabled:opacity-50',
        versionSizeClass,
      ].join(' ')}
      onClick={installed || installing ? undefined : onInstall}
    >
      <InstallIcon installed={installed} />
      <InstallLabel installed={installed} installing={installing} compact mode={mode} />
    </button>
  )
}
