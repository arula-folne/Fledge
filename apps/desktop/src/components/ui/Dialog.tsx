import { useEffect, useId, useRef } from 'react'
import { IconX } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

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
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'full'
  /** 背景のぼかし強度（lighter は背面の文字がうっすら見える） */
  backdrop?: 'default' | 'soft' | 'lighter'
  /** false のとき Esc / 背景 / × で閉じない（確認ダイアログ向け） */
  dismissible?: boolean
  /** 重ね表示用（確認ダイアログはより手前）。z-index はここだけ指定する */
  overlayClassName?: string
  /** 内容量に関係なく高さを固定する（作成ダイアログなど） */
  fixedHeight?: boolean
  /** 見出し・余白・フッターを小さくする */
  compact?: boolean
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
  overlayClassName = 'z-[80]',
  fixedHeight = false,
  compact = false,
}: Props) {
  const { t } = useTranslation()
  const full = size === 'full'
  const backdropClass =
    backdrop === 'lighter'
      ? 'bg-black/5 backdrop-blur-[2px]'
      : backdrop === 'soft'
        ? 'bg-black/25 backdrop-blur-sm'
        : 'bg-black/45 backdrop-blur-md'
  const sizeClass = full
    ? 'h-full max-h-none max-w-none rounded-none border-0 shadow-none'
    : size === 'xs'
      ? 'max-w-xs'
      : size === 'sm'
        ? 'max-w-sm'
        : size === 'lg'
          ? 'max-w-2xl'
          : 'max-w-lg'
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const fill = full || scrollable || fixedHeight
  const heightClass = full
    ? 'h-full'
    : fixedHeight
      ? 'h-[min(80vh,40rem)]'
      : scrollable
        ? 'max-h-[min(80vh,40rem)]'
        : ''

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
      className={[
        'fixed inset-x-0 bottom-0 top-[var(--titlebar-offset,0px)] flex',
        full ? 'items-stretch p-0' : 'items-center justify-center p-4',
        overlayClassName,
      ]
        .filter(Boolean)
        .join(' ')}
      role="presentation"
    >
      {full ? null : dismissible ? (
        <button
          type="button"
          aria-label={t('common.close')}
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
          'relative z-10 flex w-full flex-col overflow-hidden bg-[var(--color-surface)] text-[var(--color-text)]',
          full
            ? ''
            : 'rounded-[var(--radius-lg)] border border-[var(--color-border)] shadow-xl',
          sizeClass,
          heightClass,
        ].join(' ')}
        style={full ? undefined : { animation: 'fledge-dialog-in 200ms ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={[
            'flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)]',
            compact
              ? 'px-3 py-2'
              : size === 'sm'
                ? 'px-3.5 py-2.5'
                : full
                  ? 'px-6 py-3.5'
                  : 'px-5 py-4',
          ].join(' ')}
        >
          <div className="min-w-0">
            <h2
              id={titleId}
              className={
                compact || size === 'xs'
                  ? 'text-xs font-semibold'
                  : size === 'sm'
                    ? 'text-sm font-semibold'
                    : 'text-base font-semibold'
              }
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
              aria-label={t('common.close')}
              className={[
                'inline-flex shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
                compact ? 'size-7' : 'size-9',
              ].join(' ')}
              onClick={onClose}
            >
              <IconX size={compact ? 18 : 22} stroke={1.75} />
            </button>
          ) : null}
        </div>
        <div
          className={
            fill
              ? [
                  'min-h-0 flex-1',
                  full ? 'flex flex-col overflow-hidden' : 'overflow-y-auto',
                  compact
                    ? 'px-3 py-2'
                    : size === 'sm'
                      ? 'px-3.5 py-3'
                      : full
                        ? 'px-6 py-4'
                        : 'px-5 py-4',
                ].join(' ')
              : compact
                ? 'px-3 py-2'
                : size === 'sm'
                  ? 'px-3.5 py-3'
                  : 'px-5 py-4'
          }
        >
          {children}
        </div>
        {footer ? (
          <div
            className={[
              'flex shrink-0 justify-end gap-2 border-t border-[var(--color-border)]',
              compact ? 'px-3 py-2' : 'px-5 py-3',
            ].join(' ')}
          >
            {footer}
          </div>
        ) : null}
      </div>
      {full ? null : (
        <style>{`
        @keyframes fledge-dialog-in {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      )}
    </div>
  )
}
