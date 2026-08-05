import { IconCopy, IconMinus, IconSquare, IconX } from '@tabler/icons-react'
import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { fledgeApi } from '../../api/fledgeApi'

/**
 * OS 枠なし時の独自タイトルバー（Tabler Icons）
 */
export function TitleBar() {
  const { t } = useTranslation()
  const [maximized, setMaximized] = useState(false)

  const refresh = useCallback(() => {
    void fledgeApi.window.isMaximized().then(setMaximized)
  }, [])

  useEffect(() => {
    refresh()
    const id = window.setInterval(refresh, 800)
    return () => window.clearInterval(id)
  }, [refresh])

  return (
    <header
      className="flex h-9 shrink-0 items-center border-b border-[var(--color-border)] bg-[var(--color-surface)] select-none"
      style={{ WebkitAppRegion: 'drag' } as CSSProperties}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
        <span className="truncate text-xs font-semibold tracking-wide text-[var(--color-text)]">
          {t('app.name')}
        </span>
      </div>
      <div
        className="flex h-full items-stretch"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <TitleBtn
          label={t('window.minimize')}
          onClick={() => void fledgeApi.window.minimize()}
        >
          <IconMinus size={15} stroke={1.75} />
        </TitleBtn>
        <TitleBtn
          label={maximized ? t('window.restore') : t('window.maximize')}
          onClick={() => {
            void fledgeApi.window.maximizeToggle().then(refresh)
          }}
        >
          {maximized ? (
            <IconCopy size={14} stroke={1.75} />
          ) : (
            <IconSquare size={14} stroke={1.75} />
          )}
        </TitleBtn>
        <TitleBtn
          label={t('window.close')}
          danger
          onClick={() => void fledgeApi.window.close()}
        >
          <IconX size={15} stroke={1.75} />
        </TitleBtn>
      </div>
    </header>
  )
}

function TitleBtn({
  children,
  onClick,
  label,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  label: string
  danger?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={[
        'grid h-full w-11 place-items-center text-[var(--color-text-muted)] transition',
        danger
          ? 'hover:bg-[var(--color-danger)] hover:text-white'
          : 'hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
