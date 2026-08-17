import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

export type InstanceContextMenuState = {
  x: number
  y: number
  instanceId: string
} | null

type Props = {
  menu: InstanceContextMenuState
  onClose: () => void
  onOpen: () => void
  onEdit: () => void
  onDuplicate: () => void
  onOpenFolder: () => void
  onDelete: () => void
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      className={[
        'block w-full px-3 py-2 text-left text-sm transition',
        danger
          ? 'text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10'
          : 'text-[var(--color-text)] hover:bg-[var(--color-hover)]',
      ].join(' ')}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

export function InstanceContextMenu({
  menu,
  onClose,
  onOpen,
  onEdit,
  onDuplicate,
  onOpenFolder,
  onDelete,
}: Props) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    if (!menu) return
    const el = panelRef.current
    const pad = 8
    const width = el?.offsetWidth ?? 180
    const height = el?.offsetHeight ?? 200
    const maxX = window.innerWidth - width - pad
    const maxY = window.innerHeight - height - pad
    setPos({
      x: Math.max(pad, Math.min(menu.x, maxX)),
      y: Math.max(pad, Math.min(menu.y, maxY)),
    })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onPointer = (e: PointerEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [menu, onClose])

  if (!menu) return null

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      className="fixed z-[70] min-w-44 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 text-[var(--color-text)] shadow-sm"
      style={{ left: pos.x, top: pos.y }}
    >
      <MenuItem label={t('instances.open')} onClick={onOpen} />
      <MenuItem label={t('instances.edit')} onClick={onEdit} />
      <MenuItem label={t('instances.duplicate')} onClick={onDuplicate} />
      <MenuItem label={t('instances.openFolder')} onClick={onOpenFolder} />
      <div className="my-1 border-t border-[var(--color-border)]" />
      <MenuItem label={t('instances.delete')} danger onClick={onDelete} />
    </div>,
    document.body,
  )
}
