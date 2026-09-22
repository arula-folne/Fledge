import { useEffect, useState } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { Dialog } from './Dialog'
import { Button } from './Button'

export type ThemePreviewContent =
  | { kind: 'swatch'; label: string; background: string }
  | { kind: 'image'; label: string; src: string }
  | { kind: 'tone-image'; label: string; light: string; dark: string }

type ZoomProps = {
  onOpen: () => void
  className?: string
}

/** テーマカード右下の虫眼鏡（親の選択クリックと分離） */
export function ThemePreviewZoomButton({ onOpen, className = '' }: ZoomProps) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      className={[
        'absolute bottom-8 right-2.5 z-[2] inline-flex size-7 items-center justify-center rounded-full',
        'border border-white/25 bg-black/55 text-white shadow-sm backdrop-blur-[2px]',
        'transition hover:bg-black/70 hover:brightness-110',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-selection)]',
        className,
      ].join(' ')}
      aria-label={t('settings.theme.previewAria')}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onOpen()
      }}
    >
      <IconSearch size={15} stroke={2} aria-hidden />
    </button>
  )
}

type DialogProps = {
  open: boolean
  onClose: () => void
  preview: ThemePreviewContent | null
}

/** テーマを大きく表示するプレビュー（背景画像をそのまま表示） */
export function ThemePreviewDialog({ open, onClose, preview }: DialogProps) {
  const { t } = useTranslation()
  const [tone, setTone] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    if (!open) return
    setTone('light')
  }, [open, preview])

  if (!open || !preview) return null

  const imageSrc =
    preview.kind === 'tone-image'
      ? tone === 'light'
        ? preview.light
        : preview.dark
      : preview.kind === 'image'
        ? preview.src
        : null

  return (
    <Dialog
      open
      title={preview.label}
      subtitle={t('settings.theme.preview')}
      onClose={onClose}
      size="xl"
      overlayClassName="z-[90]"
      contentClassName="!p-3"
      footer={
        preview.kind === 'tone-image' ? (
          <div className="flex w-full flex-wrap items-center justify-center gap-2" role="group" aria-label={t('settings.theme.previewTone')}>
            <Button
              type="button"
              variant={tone === 'light' ? 'primary' : 'secondary'}
              className="!rounded-full"
              onClick={() => setTone('light')}
            >
              {t('settings.theme.light')}
            </Button>
            <Button
              type="button"
              variant={tone === 'dark' ? 'primary' : 'secondary'}
              className="!rounded-full"
              onClick={() => setTone('dark')}
            >
              {t('settings.theme.dark')}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)]">
        {imageSrc ? (
          <img
            key={imageSrc}
            src={imageSrc}
            alt=""
            className="mx-auto max-h-[min(70vh,36rem)] w-full object-contain"
            draggable={false}
          />
        ) : preview.kind === 'swatch' ? (
          <div
            className="mx-auto aspect-[16/10] max-h-[min(70vh,36rem)] w-full"
            style={{ background: preview.background }}
            aria-hidden
          />
        ) : null}
      </div>
    </Dialog>
  )
}
