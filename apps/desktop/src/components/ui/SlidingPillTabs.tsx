import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

export type SlidingPillTabItem = {
  id: string
  label: ReactNode
  /** 非選択時のラベル色（アイコン色など） */
  inactiveClassName?: string
  ariaLabel?: string
}

type Props = {
  items: SlidingPillTabItem[]
  activeId: string
  onChange: (id: string) => void
  onPrefetch?: (id: string) => void
  /** sm: インスタンス詳細 / コンテンツフィルター、md: 検索タブ */
  size?: 'sm' | 'md'
  className?: string
  'aria-label'?: string
}

type PillRect = { left: number; top: number; width: number; height: number }

/**
 * 選択中のタブ下をピルがスライドするセグメントコントロール。
 */
export function SlidingPillTabs({
  items,
  activeId,
  onChange,
  onPrefetch,
  size = 'sm',
  className = '',
  'aria-label': ariaLabel,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef(new Map<string, HTMLButtonElement>())
  const [pill, setPill] = useState<PillRect | null>(null)
  const [ready, setReady] = useState(false)

  const setBtnRef = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) btnRefs.current.set(id, el)
    else btnRefs.current.delete(id)
  }, [])

  const measure = useCallback(() => {
    const list = listRef.current
    const btn = btnRefs.current.get(activeId)
    if (!list || !btn) {
      setPill(null)
      return
    }
    const listBox = list.getBoundingClientRect()
    const btnBox = btn.getBoundingClientRect()
    setPill({
      left: btnBox.left - listBox.left + list.scrollLeft,
      top: btnBox.top - listBox.top + list.scrollTop,
      width: btnBox.width,
      height: btnBox.height,
    })
  }, [activeId])

  useLayoutEffect(() => {
    measure()
    const frame = requestAnimationFrame(() => setReady(true))
    const list = listRef.current
    if (!list) return () => cancelAnimationFrame(frame)

    const ro = new ResizeObserver(() => measure())
    ro.observe(list)
    for (const el of btnRefs.current.values()) ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure, items])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const ids = items.map((item) => item.id)
    const index = ids.indexOf(activeId)
    if (index < 0) return
    const next =
      e.key === 'ArrowRight'
        ? ids[(index + 1) % ids.length]!
        : ids[(index - 1 + ids.length) % ids.length]!
    onChange(next)
    btnRefs.current.get(next)?.focus()
  }

  const pad = size === 'md' ? 'px-2.5 py-1 text-sm' : 'px-2.5 py-1 text-xs'

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={['relative flex flex-wrap gap-0.5', className].join(' ')}
    >
      {pill ? (
        <div
          aria-hidden
          className={[
            'pointer-events-none absolute rounded-full bg-[var(--color-selection)]',
            ready
              ? 'transition-[transform,width,height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none'
              : '',
          ].join(' ')}
          style={{
            width: pill.width,
            height: pill.height,
            transform: `translate3d(${pill.left}px, ${pill.top}px, 0)`,
          }}
        />
      ) : null}
      {items.map((item) => {
        const selected = item.id === activeId
        return (
          <button
            key={item.id}
            ref={(el) => setBtnRef(item.id, el)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={item.ariaLabel}
            tabIndex={selected ? 0 : -1}
            onMouseEnter={() => onPrefetch?.(item.id)}
            onFocus={() => onPrefetch?.(item.id)}
            onClick={() => {
              if (!selected) onChange(item.id)
            }}
            className={[
              'relative z-[1] inline-flex max-w-none items-center whitespace-nowrap rounded-full font-medium transition-colors',
              pad,
              selected
                ? 'text-[var(--color-on-selection)]'
                : [
                    'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
                    item.inactiveClassName ?? '',
                  ].join(' '),
            ].join(' ')}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
