import { useEffect, useId, useRef } from 'react'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  /** お知らせなど長い本文向け */
  scrollable?: boolean
  /** 副題（日付など） */
  subtitle?: string
  size?: 'sm' | 'md' | 'lg'
  /** 背景のぼかし強度（カラーピッカー等は soft） */
  backdrop?: 'default' | 'soft'
  /** false のとき Esc / 背景 / × で閉じない（確認ダイアログ向け） */
  dismissible?: boolean
  /** 重ね表示用（確認ダイアログはより手前） */
  overlayClassName?: string
}

/**
 * 中央モーダル。Backdrop blur / Esc / 外側クリック対応。
 */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  scrollable = false,
  subtitle,
  size = 'md',
  backdrop = 'default',
  dismissible = true,
  overlayClassName = '',
}: Props) {
  const backdropClass =
    backdrop === 'soft'
      ? 'bg-black/25 backdrop-blur-sm'
      : 'bg-black/45 backdrop-blur-md'
  const sizeClass =
    size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg'
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !dismissible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, dismissible])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className={['fixed inset-0 z-50 flex items-center justify-center p-4', overlayClassName]
        .filter(Boolean)
        .join(' ')}
      role="presentation"
    >
      {dismissible ? (
        <button
          type="button"
          aria-label="close"
          className={`absolute inset-0 transition-opacity duration-200 ${backdropClass}`}
          onClick={onClose}
        />
      ) : (
        <div className={`absolute inset-0 ${backdropClass}`} aria-hidden />
      )}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={[
          'relative z-10 flex w-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-xl',
          sizeClass,
          'animate-in fade-in zoom-in-95 duration-200',
          scrollable ? 'max-h-[min(80vh,40rem)]' : '',
        ].join(' ')}
        style={{
          animation: 'fledge-dialog-in 200ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={[
            'flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-border)]',
            size === 'sm' ? 'px-3.5 py-2.5' : 'px-5 py-4',
          ].join(' ')}
        >
          <div className="min-w-0">
            <h2
              id={titleId}
              className={size === 'sm' ? 'text-sm font-semibold' : 'text-base font-semibold'}
            >
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{subtitle}</p>
            ) : null}
          </div>
          {dismissible ? (
            <button
              type="button"
              className="shrink-0 rounded-[var(--radius-sm)] px-2 py-1 text-lg leading-none text-[var(--color-text-muted)] transition hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
              onClick={onClose}
            >
              ×
            </button>
          ) : null}
        </div>
        <div
          className={
            scrollable
              ? `min-h-0 flex-1 overflow-y-auto ${size === 'sm' ? 'px-3.5 py-3' : 'px-5 py-4'}`
              : size === 'sm'
                ? 'px-3.5 py-3'
                : 'px-5 py-4'
          }
        >
          {children}
        </div>
        {footer ? (
          <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
      <style>{`
        @keyframes fledge-dialog-in {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
