import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { IconFolderOpen } from '@tabler/icons-react'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { GalleryLightbox } from '../media/GalleryLightbox'
import { instanceScreenshotUrl, isScreenshotFileName } from './screenshotUrls'

type Props = {
  instanceId: string
}

type MenuState = {
  x: number
  y: number
  fileName: string
  index: number
} | null

/** インスタンス screenshots/ を Mod ギャラリーと同様のグリッド＋ライトボックスで表示 */
export function ScreenshotsTab({ instanceId }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null)
  const [menu, setMenu] = useState<MenuState>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })

  const screenshotsQuery = useQuery({
    queryKey: ['content-media', instanceId, 'screenshots'],
    queryFn: () => fledgeApi.content.listMedia(instanceId, 'screenshots'),
  })

  const items = useMemo(
    () =>
      (screenshotsQuery.data ?? [])
        .filter((file) => isScreenshotFileName(file.name))
        .map((file) => ({
          url: instanceScreenshotUrl(instanceId, file.name),
          title: file.name,
        })),
    [screenshotsQuery.data, instanceId],
  )

  const closeMenu = useCallback(() => setMenu(null), [])

  useLayoutEffect(() => {
    if (!menu) return
    const el = menuRef.current
    const pad = 8
    const width = el?.offsetWidth ?? 180
    const height = el?.offsetHeight ?? 100
    setMenuPos({
      x: Math.max(pad, Math.min(menu.x, window.innerWidth - width - pad)),
      y: Math.max(pad, Math.min(menu.y, window.innerHeight - height - pad)),
    })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    const onPointer = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return
      closeMenu()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [menu, closeMenu])

  useEffect(() => {
    if (!copyMessage) return
    const id = window.setTimeout(() => setCopyMessage(null), 2000)
    return () => window.clearTimeout(id)
  }, [copyMessage])

  const copyMutation = useMutation({
    mutationFn: (fileName: string) => fledgeApi.content.copyScreenshot(instanceId, fileName),
    onSuccess: () => setCopyMessage(t('library.screenshotCopied')),
    onError: () => setCopyMessage(t('library.screenshotCopyFailed')),
  })

  const deleteMutation = useMutation({
    mutationFn: (fileName: string) =>
      fledgeApi.content.deleteMedia(instanceId, 'screenshots', fileName),
    onSuccess: async (_data, fileName) => {
      await queryClient.invalidateQueries({ queryKey: ['content-media', instanceId, 'screenshots'] })
      setGalleryIndex((current) => {
        if (current == null) return null
        const nextItems = items.filter((item) => item.title !== fileName)
        if (nextItems.length === 0) return null
        return Math.min(current, nextItems.length - 1)
      })
      setPendingDelete(null)
    },
  })

  const openFolder = () => {
    void fledgeApi.instances.openSubfolder(instanceId, 'screenshots')
  }

  const openContextMenu = (event: MouseEvent, fileName: string, index: number) => {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ x: event.clientX, y: event.clientY, fileName, index })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center justify-end gap-2">
        {copyMessage ? (
          <p className="mr-auto text-xs text-[var(--color-text-muted)]">{copyMessage}</p>
        ) : null}
        <Button variant="secondary" onClick={openFolder}>
          <IconFolderOpen size={16} stroke={1.75} />
          {t('instances.openScreenshots')}
        </Button>
      </div>

      {screenshotsQuery.isPending ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t('library.screenshotsEmpty')}</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item, index) => (
              <button
                key={item.url}
                type="button"
                className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-accent)]/40"
                aria-label={t('content.gallery.openImage', { n: index + 1 })}
                onClick={() => setGalleryIndex(index)}
                onContextMenu={(e) => openContextMenu(e, item.title ?? '', index)}
              >
                <img
                  src={item.url}
                  alt={item.title ?? ''}
                  loading="lazy"
                  decoding="async"
                  className="block aspect-video h-auto w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {galleryIndex !== null && items[galleryIndex] ? (
        <GalleryLightbox
          items={items}
          index={galleryIndex}
          onClose={() => setGalleryIndex(null)}
          onChange={setGalleryIndex}
        />
      ) : null}

      {menu
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="fixed z-[110] min-w-44 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 text-[var(--color-text)] shadow-sm"
              style={{ left: menuPos.x, top: menuPos.y }}
            >
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm transition hover:bg-[var(--color-hover)]"
                disabled={copyMutation.isPending}
                onClick={() => {
                  copyMutation.mutate(menu.fileName)
                  closeMenu()
                }}
              >
                {t('library.screenshotCopy')}
              </button>
              <div className="my-1 border-t border-[var(--color-border)]" />
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-[var(--color-danger)] transition hover:bg-[var(--color-danger)]/10"
                onClick={() => {
                  setPendingDelete(menu.fileName)
                  closeMenu()
                }}
              >
                {t('library.screenshotDelete')}
              </button>
            </div>,
            document.body,
          )
        : null}

      <ConfirmDialog
        open={pendingDelete != null}
        title={t('library.screenshotDeleteConfirm')}
        body={t('library.screenshotDeleteConfirmBody', { name: pendingDelete ?? '' })}
        confirmLabel={t('library.screenshotDelete')}
        pending={deleteMutation.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return
          deleteMutation.mutate(pendingDelete)
        }}
      />
    </div>
  )
}
