import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { IconFolderOpen } from '@tabler/icons-react'
import { fledgeApi } from '../../api/fledgeApi'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useUiStore } from '../../stores/appStores'
import { GalleryLightbox } from '../media/GalleryLightbox'
import { instanceScreenshotUrl, isScreenshotFileName } from './screenshotUrls'

export type ScreenshotGalleryEntry = {
  instanceId: string
  instanceName?: string
  fileName: string
  /** 絶対パス（Tauri の asset URL 用）。無い場合は Electron プロトコルへフォールバック */
  filePath?: string
  mtime?: string
}

type MenuState = {
  x: number
  y: number
  instanceId: string
  fileName: string
  index: number
} | null

type Props = {
  entries: ScreenshotGalleryEntry[]
  pending?: boolean
  /** 単一インスタンス時はフォルダを開くボタンを表示 */
  openFolderInstanceId?: string | null
  showInstanceLabel?: boolean
  /** インスタンス名でセクション分けして表示 */
  groupByInstance?: boolean
  /** ギャラリーなど: 右クリックから該当インスタンス詳細へ */
  showOpenInstance?: boolean
  emptyLabel?: string
  toolbarStart?: ReactNode
}

/** スクリーンショットのグリッド＋ライトボックス＋コピー／削除（インスタンス詳細／ギャラリー共用） */
export function ScreenshotGallery({
  entries,
  pending = false,
  openFolderInstanceId = null,
  showInstanceLabel = false,
  groupByInstance = false,
  showOpenInstance = false,
  emptyLabel,
  toolbarStart,
}: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setLibraryFocus = useUiStore((s) => s.setLibraryFocus)
  const queryClient = useQueryClient()
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null)
  const [menu, setMenu] = useState<MenuState>(null)
  const [pendingDelete, setPendingDelete] = useState<{
    instanceId: string
    fileName: string
  } | null>(null)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })

  const items = useMemo(
    () =>
      entries
        .filter((e) => isScreenshotFileName(e.fileName))
        .map((e) => ({
          url: instanceScreenshotUrl(e.instanceId, e.fileName, e.filePath),
          title: showInstanceLabel && e.instanceName
            ? `${e.instanceName} — ${e.fileName}`
            : e.fileName,
          instanceId: e.instanceId,
          instanceName: e.instanceName,
          fileName: e.fileName,
        })),
    [entries, showInstanceLabel],
  )

  const groupedSections = useMemo(() => {
    if (!groupByInstance) return null
    const sections: { id: string; title: string; startIndex: number; count: number }[] = []
    let i = 0
    while (i < items.length) {
      const id = items[i].instanceId
      const title = items[i].instanceName?.trim() || id
      const startIndex = i
      while (i < items.length && items[i].instanceId === id) i += 1
      sections.push({ id, title, startIndex, count: i - startIndex })
    }
    return sections
  }, [groupByInstance, items])

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
    mutationFn: (payload: { instanceId: string; fileName: string }) =>
      fledgeApi.content.copyScreenshot(payload.instanceId, payload.fileName),
    onSuccess: () => setCopyMessage(t('library.screenshotCopied')),
    onError: () => setCopyMessage(t('library.screenshotCopyFailed')),
  })

  const deleteMutation = useMutation({
    mutationFn: (payload: { instanceId: string; fileName: string }) =>
      fledgeApi.content.deleteMedia(payload.instanceId, 'screenshots', payload.fileName),
    onSuccess: async (_data, payload) => {
      await queryClient.invalidateQueries({
        queryKey: ['content-media', payload.instanceId, 'screenshots'],
      })
      await queryClient.invalidateQueries({ queryKey: ['gallery-screenshots'] })
      setGalleryIndex((current) => {
        if (current == null) return null
        const nextItems = items.filter(
          (item) =>
            !(item.instanceId === payload.instanceId && item.fileName === payload.fileName),
        )
        if (nextItems.length === 0) return null
        return Math.min(current, nextItems.length - 1)
      })
      setPendingDelete(null)
    },
  })

  const openFolder = (instanceId: string) => {
    void fledgeApi.instances.openSubfolder(instanceId, 'screenshots')
  }

  const openInstance = (instanceId: string) => {
    setGalleryIndex(null)
    setLibraryFocus({ instanceId, tab: 'screenshots' })
    navigate(`/library/${instanceId}`)
  }

  const openContextMenu = (
    event: MouseEvent,
    entry: { instanceId: string; fileName: string },
    index: number,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    setMenu({
      x: event.clientX,
      y: event.clientY,
      instanceId: entry.instanceId,
      fileName: entry.fileName,
      index,
    })
  }

  const menuPortal =
    menu != null
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[120] min-w-44 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 text-[var(--color-text)] shadow-sm"
            style={{ left: menuPos.x, top: menuPos.y }}
          >
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm transition hover:bg-[var(--color-hover)]"
              disabled={copyMutation.isPending}
              onClick={() => {
                copyMutation.mutate({
                  instanceId: menu.instanceId,
                  fileName: menu.fileName,
                })
                closeMenu()
              }}
            >
              {t('library.screenshotCopy')}
            </button>
            {showOpenInstance ? (
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm transition hover:bg-[var(--color-hover)]"
                onClick={() => {
                  openInstance(menu.instanceId)
                  closeMenu()
                }}
              >
                {t('gallery.openInstance')}
              </button>
            ) : null}
            {!openFolderInstanceId ? (
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm transition hover:bg-[var(--color-hover)]"
                onClick={() => {
                  openFolder(menu.instanceId)
                  closeMenu()
                }}
              >
                {t('instances.openScreenshots')}
              </button>
            ) : null}
            <div className="my-1 border-t border-[var(--color-border)]" />
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm text-[var(--color-danger)] transition hover:bg-[var(--color-danger)]/10"
              onClick={() => {
                setPendingDelete({ instanceId: menu.instanceId, fileName: menu.fileName })
                closeMenu()
              }}
            >
              {t('library.screenshotDelete')}
            </button>
          </div>,
          document.body,
        )
      : null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {toolbarStart ? <div className="mr-auto flex min-w-0 flex-wrap items-center gap-2">{toolbarStart}</div> : null}
        {copyMessage ? (
          <p className={toolbarStart ? 'text-xs text-[var(--color-text-muted)]' : 'mr-auto text-xs text-[var(--color-text-muted)]'}>
            {copyMessage}
          </p>
        ) : null}
        {openFolderInstanceId ? (
          <Button variant="secondary" onClick={() => openFolder(openFolderInstanceId)}>
            <IconFolderOpen size={16} stroke={1.75} />
            {t('instances.openScreenshots')}
          </Button>
        ) : null}
      </div>

      {pending ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          {emptyLabel ?? t('library.screenshotsEmpty')}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {groupedSections ? (
            <div className="flex flex-col gap-5">
              {groupedSections.map((section) => (
                <section key={section.id} className="min-w-0">
                  <h2 className="mb-2 text-sm font-medium text-[var(--color-text)]">{section.title}</h2>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {items.slice(section.startIndex, section.startIndex + section.count).map((item, localIndex) => {
                      const index = section.startIndex + localIndex
                      return (
                        <button
                          key={`${item.instanceId}:${item.fileName}`}
                          type="button"
                          className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-left transition-colors hover:border-[var(--color-accent)]/40"
                          aria-label={t('content.gallery.openImage', { n: index + 1 })}
                          onClick={() => setGalleryIndex(index)}
                          onContextMenu={(e) =>
                            openContextMenu(
                              e,
                              {
                                instanceId: item.instanceId,
                                fileName: item.fileName,
                              },
                              index,
                            )
                          }
                        >
                          <img
                            src={item.url}
                            alt={item.title ?? ''}
                            loading="lazy"
                            decoding="async"
                            className="block aspect-video h-auto w-full object-cover"
                          />
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item, index) => (
                <button
                  key={`${item.instanceId}:${item.fileName}`}
                  type="button"
                  className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-left transition-colors hover:border-[var(--color-accent)]/40"
                  aria-label={t('content.gallery.openImage', { n: index + 1 })}
                  onClick={() => setGalleryIndex(index)}
                  onContextMenu={(e) =>
                    openContextMenu(
                      e,
                      {
                        instanceId: item.instanceId,
                        fileName: item.fileName,
                      },
                      index,
                    )
                  }
                >
                  <img
                    src={item.url}
                    alt={item.title ?? ''}
                    loading="lazy"
                    decoding="async"
                    className="block aspect-video h-auto w-full object-cover"
                  />
                  {showInstanceLabel && item.instanceName ? (
                    <span className="block truncate px-2 py-1.5 text-xs text-[var(--color-text-muted)]">
                      {item.instanceName}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {galleryIndex !== null && items[galleryIndex] ? (
        <GalleryLightbox
          items={items}
          index={galleryIndex}
          onClose={() => setGalleryIndex(null)}
          onChange={setGalleryIndex}
          onItemContextMenu={(e, index) => {
            const item = items[index]
            if (!item) return
            openContextMenu(
              e,
              {
                instanceId: item.instanceId,
                fileName: item.fileName,
              },
              index,
            )
          }}
        />
      ) : null}

      {menuPortal}

      <ConfirmDialog
        open={pendingDelete != null}
        title={t('library.screenshotDeleteConfirm')}
        body={t('library.screenshotDeleteConfirmBody', { name: pendingDelete?.fileName ?? '' })}
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
