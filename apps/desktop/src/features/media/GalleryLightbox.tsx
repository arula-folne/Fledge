import { useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { Button } from '../../components/ui/Button'

export type GalleryItem = {
  url: string
  title?: string
  featured?: boolean
}

type Props = {
  items: GalleryItem[]
  index: number
  onClose: () => void
  onChange: (index: number) => void
}

/** Mod ギャラリー／インスタンス スクリーンショット共通の全画面ビューア */
export function GalleryLightbox({ items, index, onClose, onChange }: Props) {
  const { t } = useTranslation()
  const item = items[index]
  const hasPrev = index > 0
  const hasNext = index < items.length - 1

  const goPrev = useCallback(() => {
    if (hasPrev) onChange(index - 1)
  }, [hasPrev, index, onChange])

  const goNext = useCallback(() => {
    if (hasNext) onChange(index + 1)
  }, [hasNext, index, onChange])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        onClose()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, goPrev, goNext])

  if (!item) return null

  return createPortal(
    <div className="fixed inset-x-0 bottom-0 top-[var(--titlebar-offset,0px)] z-[100] flex flex-col bg-black/85">
      <div
        className="flex min-h-0 flex-1 items-center justify-center overflow-auto pb-16 pt-[2vh]"
        onClick={onClose}
        role="presentation"
      >
        <img
          src={item.url}
          alt={item.title ?? ''}
          decoding="async"
          className="h-auto max-h-none w-auto max-w-none object-none"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-3 border-t border-white/10 bg-black/75 px-4 py-3 backdrop-blur-sm">
        <Button
          type="button"
          variant="secondary"
          className="border-white/15 bg-white/10 text-white hover:bg-white/20"
          disabled={!hasPrev}
          onClick={goPrev}
        >
          <IconChevronLeft size={16} stroke={1.75} />
          {t('content.gallery.prev')}
        </Button>
        <span className="min-w-[4.5rem] text-center text-sm tabular-nums text-white/80">
          {t('content.gallery.position', { current: index + 1, total: items.length })}
        </span>
        <Button
          type="button"
          variant="secondary"
          className="border-white/15 bg-white/10 text-white hover:bg-white/20"
          disabled={!hasNext}
          onClick={goNext}
        >
          {t('content.gallery.next')}
          <IconChevronRight size={16} stroke={1.75} />
        </Button>
      </div>
    </div>,
    document.body,
  )
}
