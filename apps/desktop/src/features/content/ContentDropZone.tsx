import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import type { ContentCategory } from '@fledge/shared'
import { ContentCategoryIcon } from './contentCategoryIcons'

const DROP_EXTS = ['.jar', '.zip', '.mrpack'] as const

export type DropPreview = {
  name: string
  category: ContentCategory | 'unknown'
}

function guessCategoryFromName(fileName: string): ContentCategory | 'unknown' {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.jar')) return 'mod'
  if (lower.endsWith('.mrpack')) return 'modpack'
  if (lower.endsWith('.zip')) return 'resourcepack'
  return 'unknown'
}

function isDroppablePath(path: string): boolean {
  const lower = path.toLowerCase()
  return DROP_EXTS.some((ext) => lower.endsWith(ext))
}

function fileNameFromPath(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

/**
 * インスタンス詳細のコンテンツ領域向け DnD。
 * OS からのファイルドロップを受け、Fledge カテゴリアイコンでプレビューする。
 */
export function useContentFileDrop(options: {
  enabled: boolean
  onDropPaths: (paths: string[]) => void
}) {
  const { enabled, onDropPaths } = options
  const [active, setActive] = useState(false)
  const [previews, setPreviews] = useState<DropPreview[]>([])

  const applyPaths = useCallback(
    (paths: string[], dropping: boolean) => {
      const usable = paths.filter(isDroppablePath)
      setPreviews(
        usable.map((path) => {
          const name = fileNameFromPath(path)
          return { name, category: guessCategoryFromName(name) }
        }),
      )
      if (dropping && usable.length > 0) {
        onDropPaths(usable)
      }
      if (dropping || usable.length === 0) {
        setActive(false)
        if (dropping) setPreviews([])
      } else {
        setActive(true)
      }
    },
    [onDropPaths],
  )

  useEffect(() => {
    if (!enabled) return
    let unlisten: (() => void) | undefined
    let cancelled = false
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (cancelled) return
        const payload = event.payload
        if (payload.type === 'enter' || payload.type === 'drop') {
          applyPaths(payload.paths, payload.type === 'drop')
        } else if (payload.type === 'leave') {
          setActive(false)
          setPreviews([])
        }
      })
      .then((fn) => {
        if (cancelled) fn()
        else unlisten = fn
      })
      .catch(() => {
        /* web / unsupported */
      })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [enabled, applyPaths])

  return { active, previews }
}

export function ContentDropOverlay({
  active,
  previews,
}: {
  active: boolean
  previews: DropPreview[]
}) {
  const { t } = useTranslation()
  const categories = useMemo(() => {
    const set = new Set<ContentCategory>()
    for (const p of previews) {
      if (p.category !== 'unknown' && p.category !== 'modpack') set.add(p.category)
    }
    return [...set]
  }, [previews])

  if (!active) return null

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[var(--radius-md)] border-2 border-dashed border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-surface)_82%,var(--color-accent)_18%)]"
      aria-hidden
    >
      <div className="flex max-w-[90%] flex-col items-center gap-3 px-4 text-center">
        <div className="flex items-center gap-2">
          {(categories.length > 0
            ? categories
            : (['mod', 'resourcepack', 'shader', 'datapack'] as ContentCategory[])
          ).map((cat) => (
            <span
              key={cat}
              className="flex size-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface)] shadow-sm"
            >
              <ContentCategoryIcon category={cat} size={22} />
            </span>
          ))}
        </div>
        <p className="text-sm font-medium text-[var(--color-text)]">{t('content.dropHint')}</p>
        <p className="text-xs text-[var(--color-text-muted)]">{t('content.dropHintTypes')}</p>
      </div>
    </div>
  )
}
