import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  IconChartLine,
  IconChevronsUp,
  IconClockPause,
  IconCloudRain,
  IconContrast,
  IconCpu,
  IconCrown,
  IconCube,
  IconDeviceDesktop,
  IconDeviceGamepad2,
  IconDisc,
  IconEye,
  IconGauge,
  IconKeyboard,
  IconLanguage,
  IconLayersIntersect,
  IconLayoutBoard,
  IconMouse,
  IconMusic,
  IconNumbers,
  IconRefresh,
  IconSun,
  IconTextCaption,
  IconViewfinder,
  IconVolume,
  IconWaveSine,
} from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { EMPTY_MINECRAFT_INITIAL_SETTINGS, type MinecraftInitialSettings } from '@fledge/shared'
import { MINECRAFT_LANGUAGES } from '../../data/minecraftLanguages'
import { Button } from '../ui/Button'
import { MinecraftKeybindsDialog } from './MinecraftKeybindsDialog'

type Props = {
  value: MinecraftInitialSettings
  onChange: (next: MinecraftInitialSettings) => void
  labels: {
    hint: string
    reset: string
    mcDefault: string
    game: string
    audio: string
    video: string
    controls: string
    lang: string
    langSearch: string
    langEmpty: string
    subtitles: string
    autoJump: string
    fov: string
    masterVolume: string
    music: string
    maxFps: string
    vsync: string
    fpsCondition: string
    fpsConditionAfk: string
    fpsConditionMinimized: string
    guiScale: string
    guiScaleAuto: string
    brightness: string
    renderDistance: string
    simulationDistance: string
    mouseSensitivity: string
    on: string
    off: string
    unlimited: string
    chunks: string
    degrees: string
    normal: string
    quakePro: string
    moody: string
    bright: string
  }
}

type SettingIcon = ComponentType<{ size?: number; stroke?: number; className?: string }>

function SettingLabel({ icon: Icon, children }: { icon: SettingIcon; children: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon size={18} stroke={1.7} className="shrink-0 text-[var(--color-text-muted)]" aria-hidden />
      <span className="min-w-0 text-sm font-medium text-[var(--color-text)]">{children}</span>
    </span>
  )
}

function matchesLanguage(item: { value: string; label: string }, query: string) {
  const q = query.trim().toLowerCase().replace(/-/g, '_')
  if (!q) return true
  return item.label.toLowerCase().includes(q) || item.value.toLowerCase().includes(q)
}

function LanguageSelect({
  value,
  onChange,
  labels,
}: {
  value: string | null
  onChange: (next: string | null) => void
  labels: Props['labels']
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const currentLabel =
    value === null
      ? labels.mcDefault
      : (MINECRAFT_LANGUAGES.find((item) => item.value === value)?.label ?? value)

  const filtered = MINECRAFT_LANGUAGES.filter((item) => matchesLanguage(item, query))
  const q = query.trim().toLowerCase()
  const showDefault = !q || labels.mcDefault.toLowerCase().includes(q)
  const options = [...(showDefault ? [{ value: '', label: labels.mcDefault }] : []), ...filtered]

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="flex flex-col gap-1">
      <SettingLabel icon={IconLanguage}>{labels.lang}</SettingLabel>
      <button
        type="button"
        className={[
          'flex w-full items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-left text-sm text-[var(--color-text)] outline-none',
          'focus:border-[var(--color-accent)]',
        ].join(' ')}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v)
          setQuery('')
        }}
      >
        <span className="min-w-0 truncate">{currentLabel}</span>
        <span className="ml-2 shrink-0 text-[var(--color-text-muted)]">{open ? '▴' : '▾'}</span>
      </button>
      {open ? (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={labels.langSearch}
            className="w-full border-b border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-sm text-[var(--color-text)] outline-none"
          />
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {options.length === 0 ? (
              <li className="px-3 py-2 text-sm text-[var(--color-text-muted)]">{labels.langEmpty}</li>
            ) : (
              options.map((item) => {
              const selected = (item.value === '' && value === null) || item.value === value
              return (
                <li key={item.value || 'default'}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={[
                      'flex w-full px-3 py-2 text-left text-sm',
                      selected
                        ? 'bg-[var(--color-selection-soft)] font-medium text-[var(--color-selection)]'
                        : 'text-[var(--color-text)] hover:bg-[var(--color-hover)]',
                    ].join(' ')}
                    onClick={() => {
                      onChange(item.value || null)
                      setOpen(false)
                      setQuery('')
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              )
            })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function valueFromClientX(
  track: HTMLDivElement,
  clientX: number,
  min: number,
  max: number,
  step: number,
) {
  const rect = track.getBoundingClientRect()
  const pad = 8
  const inner = Math.max(1, rect.width - pad * 2)
  const t = (clientX - rect.left - pad) / inner
  const raw = min + clamp(t, 0, 1) * (max - min)
  const stepped = Math.round(raw / step) * step
  return clamp(Number(stepped.toFixed(6)), min, max)
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function mixCssColor(from: string, to: string, t: number) {
  const pct = Math.round(clamp(t, 0, 1) * 100)
  return `color-mix(in srgb, ${from} ${100 - pct}%, ${to} ${pct}%)`
}

/** これ未満の移動は短押し。手ブレで隣へ飛ばないようにする。 */
const TAP_SLOP_PX = 16

/** ポインタが乗っている（または最も近い）ボタン。中点補間ではなく矩形で判定する。 */
function nearestChoiceIndex(
  buttons: Array<HTMLElement | null | undefined>,
  clientX: number,
  clientY: number,
) {
  let best = { index: -1, dist: Infinity }
  for (let i = 0; i < buttons.length; i += 1) {
    const button = buttons[i]
    if (!button) continue
    const rect = button.getBoundingClientRect()
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return i
    }
    const dx = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0
    const dy = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0
    const dist = dx * dx + dy * dy
    if (dist < best.dist) best = { index: i, dist }
  }
  return best.index >= 0 ? best.index : null
}

function choicePillFromPointer(
  buttons: Array<HTMLElement | null | undefined>,
  clientX: number,
  clientY: number,
) {
  const items = buttons.flatMap((button, index) => {
    if (!button) return []
    const rect = button.getBoundingClientRect()
    return [
      {
        index,
        left: button.offsetLeft,
        top: button.offsetTop,
        width: button.offsetWidth,
        height: button.offsetHeight,
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height / 2,
      },
    ]
  })
  if (items.length === 0) return null
  if (items.length === 1) {
    const only = items[0]
    if (!only) return null
    return {
      left: only.left,
      top: only.top,
      width: only.width,
      height: only.height,
      nearest: only.index,
      from: only.index,
      to: only.index,
      t: 0,
    }
  }

  let best = { dist: Infinity, from: 0, to: 1, t: 0 }
  for (let i = 0; i < items.length - 1; i += 1) {
    const a = items[i]
    const b = items[i + 1]
    if (!a || !b) continue
    const abx = b.cx - a.cx
    const aby = b.cy - a.cy
    const len2 = abx * abx + aby * aby || 1
    const t = clamp(((clientX - a.cx) * abx + (clientY - a.cy) * aby) / len2, 0, 1)
    const px = a.cx + abx * t
    const py = a.cy + aby * t
    const dist = (clientX - px) ** 2 + (clientY - py) ** 2
    if (dist < best.dist) best = { dist, from: i, to: i + 1, t }
  }

  const a = items[best.from]
  const b = items[best.to]
  if (!a || !b) return null
  return {
    left: lerp(a.left, b.left, best.t),
    top: lerp(a.top, b.top, best.t),
    width: lerp(a.width, b.width, best.t),
    height: lerp(a.height, b.height, best.t),
    nearest: best.t < 0.5 ? a.index : b.index,
    from: a.index,
    to: b.index,
    t: best.t,
  }
}

function useChoicePointerHandlers(opts: {
  hitIndex: (clientX: number, clientY: number) => number | null
  commitIndex: (index: number) => void
  snapIndex: (index: number) => void
  followPointer: (clientX: number, clientY: number) => void
}) {
  const capturingRef = useRef(false)
  const draggingRef = useRef(false)
  const pressedIndexRef = useRef(0)
  const startRef = useRef({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const optsRef = useRef(opts)
  optsRef.current = opts

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const index = optsRef.current.hitIndex(e.clientX, e.clientY)
    if (index == null) return
    capturingRef.current = true
    draggingRef.current = false
    pressedIndexRef.current = index
    startRef.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
    optsRef.current.commitIndex(index)
    optsRef.current.snapIndex(index)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!capturingRef.current) return
    const dx = e.clientX - startRef.current.x
    const dy = e.clientY - startRef.current.y
    if (!draggingRef.current && dx * dx + dy * dy < TAP_SLOP_PX * TAP_SLOP_PX) return
    if (!draggingRef.current) {
      draggingRef.current = true
      setDragging(true)
    }
    optsRef.current.followPointer(e.clientX, e.clientY)
  }

  const finishPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!capturingRef.current) return
    capturingRef.current = false
    const wasDragging = draggingRef.current
    draggingRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const index = wasDragging
      ? (optsRef.current.hitIndex(e.clientX, e.clientY) ?? pressedIndexRef.current)
      : pressedIndexRef.current
    optsRef.current.commitIndex(index)
    setDragging(false)
    if (wasDragging) {
      requestAnimationFrame(() => optsRef.current.snapIndex(index))
    } else {
      optsRef.current.snapIndex(index)
    }
  }

  return {
    dragging,
    capturingRef,
    draggingRef,
    onPointerDown,
    onPointerMove,
    finishPointer,
  }
}

const BOOL_PILL = {
  default: { bg: 'var(--color-surface)', text: 'var(--color-text)' },
  on: { bg: 'rgb(125, 211, 252)', text: 'rgb(12, 74, 110)' },
  off: { bg: 'rgb(156, 163, 175)', text: 'rgb(31, 41, 55)' },
} as const

function NullableBoolRow({
  icon,
  label,
  value,
  onChange,
  labels,
}: {
  icon: SettingIcon
  label: string
  value: boolean | null
  onChange: (next: boolean | null) => void
  labels: Props['labels']
}) {
  const buttonRefs = useRef<Partial<Record<keyof typeof BOOL_PILL, HTMLButtonElement | null>>>({})
  const [localValue, setLocalValue] = useState(value)
  const [pill, setPill] = useState<{ left: number; width: number; color: string }>({
    left: 2,
    width: 0,
    color: BOOL_PILL.default.bg,
  })
  const options: Array<{
    id: keyof typeof BOOL_PILL
    text: string
    next: boolean | null
  }> = [
    { id: 'default', text: labels.mcDefault, next: null },
    { id: 'on', text: labels.on, next: true },
    { id: 'off', text: labels.off, next: false },
  ]
  const selectedId: keyof typeof BOOL_PILL =
    localValue === null ? 'default' : localValue ? 'on' : 'off'
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const liveRef = useRef(localValue)
  liveRef.current = localValue

  const buttons = () => options.map((opt) => buttonRefs.current[opt.id])

  const commitIndex = (index: number) => {
    const next = options[index]?.next
    if (next === undefined) return
    if (Object.is(next, liveRef.current)) return
    liveRef.current = next
    setLocalValue(next)
    onChangeRef.current(next)
  }

  const snapPill = (index: number) => {
    const button = buttons()[index]
    const option = options[index]
    if (!button || !option) return
    setPill({
      left: button.offsetLeft,
      width: button.offsetWidth,
      color: BOOL_PILL[option.id].bg,
    })
  }

  const followPointer = (clientX: number, clientY: number) => {
    const layout = choicePillFromPointer(buttons(), clientX, clientY)
    if (!layout) return
    const from = options[layout.from]
    const to = options[layout.to]
    if (!from || !to) return
    setPill({
      left: layout.left,
      width: layout.width,
      color: mixCssColor(BOOL_PILL[from.id].bg, BOOL_PILL[to.id].bg, layout.t),
    })
    const index = nearestChoiceIndex(buttons(), clientX, clientY)
    if (index != null) commitIndex(index)
  }

  const { dragging, capturingRef, draggingRef, onPointerDown, onPointerMove, finishPointer } =
    useChoicePointerHandlers({
      hitIndex: (x, y) => nearestChoiceIndex(buttons(), x, y),
      commitIndex,
      snapIndex: snapPill,
      followPointer,
    })

  useEffect(() => {
    if (capturingRef.current) return
    setLocalValue(value)
  }, [capturingRef, value])

  useLayoutEffect(() => {
    const button = buttonRefs.current[selectedId]
    if (!button) return
    setPill({
      left: button.offsetLeft,
      width: button.offsetWidth,
      color: BOOL_PILL[selectedId].bg,
    })
  }, [])

  useEffect(() => {
    if (draggingRef.current) return
    const button = buttonRefs.current[selectedId]
    if (!button) return
    setPill({
      left: button.offsetLeft,
      width: button.offsetWidth,
      color: BOOL_PILL[selectedId].bg,
    })
  }, [draggingRef, selectedId, labels.mcDefault, labels.on, labels.off])

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SettingLabel icon={icon}>{label}</SettingLabel>
      <div
        role="radiogroup"
        aria-label={label}
        className={[
          'relative flex shrink-0 touch-none select-none overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5',
          dragging ? 'cursor-grabbing' : 'cursor-pointer',
        ].join(' ')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
      >
        <div
          aria-hidden
          className={[
            'pointer-events-none absolute top-0.5 bottom-0.5 rounded-[calc(var(--radius-sm)-2px)] shadow-sm',
            dragging
              ? ''
              : 'transition-[left,width,background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]',
          ].join(' ')}
          style={{
            left: pill.left,
            width: pill.width,
            backgroundColor: pill.color,
          }}
        />
        {options.map((opt) => {
          const selected = opt.id === selectedId
          return (
            <button
              key={opt.id}
              ref={(el) => {
                buttonRefs.current[opt.id] = el
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              className={[
                'relative z-10 min-h-8 whitespace-nowrap py-2 text-xs font-medium leading-none transition-colors duration-150',
                opt.id === 'default' ? 'min-w-[4.5rem] px-3' : 'min-w-[3rem] px-3',
                selected ? '' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
              ].join(' ')}
              style={selected ? { color: BOOL_PILL[opt.id].text } : undefined}
              onClick={() => commitIndex(options.findIndex((item) => item.id === opt.id))}
              onKeyDown={(e) => {
                const current = options.findIndex((item) => item.id === selectedId)
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  e.preventDefault()
                  const dir = e.key === 'ArrowLeft' ? -1 : 1
                  const next = options[clamp(current + dir, 0, options.length - 1)]
                  if (next) onChange(next.next)
                }
              }}
            >
              {opt.text}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ResetButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-hover)]"
      onClick={onClick}
    >
      <IconRefresh size={16} stroke={1.75} />
    </button>
  )
}

function SliderRow({
  icon,
  label,
  value,
  defaultValue,
  min,
  max,
  step,
  format,
  onChange,
  labels,
}: {
  icon: SettingIcon
  label: string
  value: number | null
  defaultValue: number
  min: number
  max: number
  step: number
  format: (n: number) => string
  onChange: (next: number | null) => void
  labels: Props['labels']
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const [dragging, setDragging] = useState(false)
  const [draft, setDraft] = useState<number | null>(value)
  const [optimistic, setOptimistic] = useState<number | null>(null)

  useEffect(() => {
    if (dragging) return
    if (optimistic === null) {
      setDraft(value)
      return
    }
    if (value === null) return
    if (Math.abs(value - optimistic) <= step / 2) setOptimistic(null)
  }, [dragging, optimistic, step, value])

  const display = dragging ? draft : (optimistic ?? value)
  const effective = display ?? defaultValue
  const ratio = (effective - min) / (max - min || 1)
  const percent = clamp(ratio, 0, 1) * 100
  const defaultPercent = clamp((defaultValue - min) / (max - min || 1), 0, 1) * 100
  const atDefault = Math.abs(effective - defaultValue) <= step / 2

  const applyFromPointer = (clientX: number) => {
    const track = trackRef.current
    if (!track) return
    const next = valueFromClientX(track, clientX, min, max, step)
    setDraft(next)
    return next
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    draggingRef.current = true
    setOptimistic(null)
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
    applyFromPointer(e.clientX)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    applyFromPointer(e.clientX)
  }

  const finishPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const next = applyFromPointer(e.clientX)
    setDragging(false)
    if (next === undefined) return
    setOptimistic(next)
    onChange(next)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <SettingLabel icon={icon}>{label}</SettingLabel>
        </span>
        <span
          className={[
            'shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums tracking-tight',
            display === null ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text)]',
          ].join(' ')}
        >
          {format(effective)}
          {display === null ? (
            <span className="ml-1 font-medium">（{labels.mcDefault}）</span>
          ) : null}
        </span>
        <ResetButton
          label={labels.reset}
          onClick={() => {
            setOptimistic(null)
            setDraft(null)
            onChange(null)
          }}
        />
      </div>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(effective)}
        aria-valuetext={format(effective)}
        className="relative flex h-10 w-full cursor-grab items-center touch-none select-none px-2 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onKeyDown={(e) => {
          const current = effective
          const commit = (next: number) => {
            setOptimistic(next)
            setDraft(next)
            onChange(next)
          }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault()
            commit(clamp(current - step, min, max))
          }
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault()
            commit(clamp(current + step, min, max))
          }
          if (e.key === 'Home') {
            e.preventDefault()
            commit(min)
          }
          if (e.key === 'End') {
            e.preventDefault()
            commit(max)
          }
        }}
      >
        <div className="pointer-events-none absolute inset-x-2 h-2 overflow-hidden rounded-full bg-[var(--color-border)]">
          <div
            className={[
              'h-full rounded-full bg-[var(--color-accent)]',
              dragging ? '' : 'transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
            ].join(' ')}
            style={{ width: `${percent}%` }}
          />
        </div>
        <div
          className={[
            'pointer-events-none absolute z-[5] size-2.5 -translate-x-1/2 rounded-full border-2',
            atDefault
              ? 'scale-125 border-[var(--color-accent)] bg-[var(--color-accent)]'
              : 'border-[var(--color-accent)]/55 bg-[var(--color-surface)]',
          ].join(' ')}
          style={{ left: `calc(0.5rem + (100% - 1rem) * ${defaultPercent / 100})` }}
          aria-hidden
        />
        <div
          className={[
            'pointer-events-none absolute z-10 size-4 -translate-x-1/2 rounded-full border-2 border-[var(--color-accent)] bg-[var(--color-surface)] shadow-sm',
            dragging ? '' : 'transition-[left] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          ].join(' ')}
          style={{ left: `calc(0.5rem + (100% - 1rem) * ${percent / 100})` }}
          aria-hidden
        />
      </div>
    </div>
  )
}

function ChoiceList({
  icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: SettingIcon
  label: string
  value: string
  options: { value: string; label: string; compact?: boolean }[]
  onChange: (next: string) => void
}) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [localValue, setLocalValue] = useState(value)
  const [pill, setPill] = useState({ left: 0, top: 0, width: 0, height: 0 })
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const valueRef = useRef(localValue)
  valueRef.current = localValue
  const optionsRef = useRef(options)
  optionsRef.current = options

  const commitIndex = (index: number) => {
    const next = optionsRef.current[index]?.value
    if (next === undefined || next === valueRef.current) return
    valueRef.current = next
    setLocalValue(next)
    onChangeRef.current(next)
  }

  const snapPill = (index: number) => {
    const button = buttonRefs.current[index]
    if (!button) return
    setPill({
      left: button.offsetLeft,
      top: button.offsetTop,
      width: button.offsetWidth,
      height: button.offsetHeight,
    })
  }

  const followPointer = (clientX: number, clientY: number) => {
    const layout = choicePillFromPointer(buttonRefs.current, clientX, clientY)
    if (!layout) return
    setPill({
      left: layout.left,
      top: layout.top,
      width: layout.width,
      height: layout.height,
    })
    const index = nearestChoiceIndex(buttonRefs.current, clientX, clientY)
    if (index != null) commitIndex(index)
  }

  const { dragging, capturingRef, draggingRef, onPointerDown, onPointerMove, finishPointer } =
    useChoicePointerHandlers({
      hitIndex: (x, y) => nearestChoiceIndex(buttonRefs.current, x, y),
      commitIndex,
      snapIndex: snapPill,
      followPointer,
    })

  const optionKey = options.map((item) => `${item.value}:${item.label}`).join('|')

  useEffect(() => {
    if (capturingRef.current) return
    setLocalValue(value)
  }, [capturingRef, value])

  useLayoutEffect(() => {
    const index = options.findIndex((item) => item.value === localValue)
    if (index < 0) {
      setPill((current) => ({ ...current, width: 0, height: 0 }))
      return
    }
    const button = buttonRefs.current[index]
    if (!button) return
    setPill({
      left: button.offsetLeft,
      top: button.offsetTop,
      width: button.offsetWidth,
      height: button.offsetHeight,
    })
  }, [])

  useEffect(() => {
    if (draggingRef.current) return
    const index = options.findIndex((item) => item.value === localValue)
    if (index < 0) {
      setPill((current) => ({ ...current, width: 0, height: 0 }))
      return
    }
    const button = buttonRefs.current[index]
    if (!button) return
    setPill({
      left: button.offsetLeft,
      top: button.offsetTop,
      width: button.offsetWidth,
      height: button.offsetHeight,
    })
  }, [draggingRef, localValue, optionKey])

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <SettingLabel icon={icon}>{label}</SettingLabel>
      <div
        role="radiogroup"
        aria-label={label}
        className={[
          'relative flex flex-wrap justify-end gap-1.5 touch-none select-none',
          dragging ? 'cursor-grabbing' : 'cursor-pointer',
        ].join(' ')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
      >
        <div
          aria-hidden
          className={[
            'pointer-events-none absolute rounded-[var(--radius-sm)] border border-[var(--color-selection)] bg-[var(--color-selection-soft)]',
            dragging
              ? ''
              : 'transition-[left,top,width,height] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]',
          ].join(' ')}
          style={{
            left: pill.left,
            top: pill.top,
            width: pill.width,
            height: pill.height,
          }}
        />
        {options.map((o, index) => {
          const selected = o.value === localValue
          return (
            <button
              key={o.value || 'default'}
              ref={(el) => {
                buttonRefs.current[index] = el
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              className={[
                'relative z-10 min-h-8 rounded-[var(--radius-sm)] border px-2.5 py-2 text-xs font-medium transition-colors duration-150',
                o.compact ? 'min-w-9' : '',
                selected
                  ? 'border-transparent text-[var(--color-selection)]'
                  : 'border-transparent bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
              ].join(' ')}
              onClick={() => commitIndex(index)}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Group({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: SettingIcon
  children: ReactNode
}) {
  return (
    <div className="space-y-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-[var(--color-text)]">
        <Icon size={18} stroke={1.7} className="shrink-0 text-[var(--color-text-muted)]" aria-hidden />
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

export function MinecraftInitialSettingsPanel({ value, onChange, labels }: Props) {
  const { t } = useTranslation()
  const current = { ...EMPTY_MINECRAFT_INITIAL_SETTINGS, ...value, keybinds: value.keybinds ?? {} }
  const patch = (partial: Partial<MinecraftInitialSettings>) =>
    onChange({ ...current, ...partial })
  const [keybindsOpen, setKeybindsOpen] = useState(false)

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">{labels.hint}</p>

      <Group title={labels.game} icon={IconDeviceGamepad2}>
        <LanguageSelect
          value={current.lang}
          onChange={(lang) => patch({ lang })}
          labels={labels}
        />
        <NullableBoolRow
          icon={IconTextCaption}
          label={labels.subtitles}
          value={current.showSubtitles}
          onChange={(showSubtitles) => patch({ showSubtitles })}
          labels={labels}
        />
        <NullableBoolRow
          icon={IconChevronsUp}
          label={labels.autoJump}
          value={current.autoJump}
          onChange={(autoJump) => patch({ autoJump })}
          labels={labels}
        />
        <NullableBoolRow
          icon={IconWaveSine}
          label={t('settings.minecraftInitial.bobView')}
          value={current.bobView}
          onChange={(bobView) => patch({ bobView })}
          labels={labels}
        />
        <SliderRow
          icon={IconViewfinder}
          label={labels.fov}
          value={current.fovDegrees}
          defaultValue={70}
          min={30}
          max={110}
          step={1}
          format={(n) => {
            const deg = Math.round(n)
            if (deg === 70) return `${deg}${labels.degrees}${labels.normal}`
            if (deg === 110) return `${deg}${labels.degrees}${labels.quakePro}`
            return `${deg}${labels.degrees}`
          }}
          onChange={(fovDegrees) => patch({ fovDegrees })}
          labels={labels}
        />
      </Group>

      <Group title={labels.video} icon={IconDeviceDesktop}>
        <SliderRow
          icon={IconGauge}
          label={labels.maxFps}
          value={current.maxFps}
          defaultValue={120}
          min={10}
          max={260}
          step={10}
          format={(n) => (n >= 260 ? labels.unlimited : `${Math.round(n)}`)}
          onChange={(maxFps) =>
            patch({
              maxFps:
                maxFps === null ? null : Math.min(260, Math.max(10, Math.round(maxFps / 10) * 10)),
            })
          }
          labels={labels}
        />
        <NullableBoolRow
          icon={IconLayersIntersect}
          label={labels.vsync}
          value={current.enableVsync}
          onChange={(enableVsync) => patch({ enableVsync })}
          labels={labels}
        />
        <ChoiceList
          icon={IconClockPause}
          label={labels.fpsCondition}
          value={current.inactivityFpsLimit ?? ''}
          options={[
            { value: '', label: labels.mcDefault },
            { value: 'afk', label: labels.fpsConditionAfk },
            { value: 'minimized', label: labels.fpsConditionMinimized },
          ]}
          onChange={(raw) =>
            patch({
              inactivityFpsLimit: raw === 'afk' || raw === 'minimized' ? raw : null,
            })
          }
        />
        <ChoiceList
          icon={IconLayoutBoard}
          label={labels.guiScale}
          value={current.guiScale === null ? '' : String(current.guiScale)}
          options={[
            { value: '', label: labels.mcDefault },
            { value: '0', label: labels.guiScaleAuto },
            { value: '1', label: '1', compact: true },
            { value: '2', label: '2', compact: true },
            { value: '3', label: '3', compact: true },
            { value: '4', label: '4', compact: true },
          ]}
          onChange={(raw) => patch({ guiScale: raw === '' ? null : Number(raw) })}
        />
        <SliderRow
          icon={IconSun}
          label={labels.brightness}
          value={current.gamma === null ? null : current.gamma * 100}
          defaultValue={50}
          min={0}
          max={100}
          step={1}
          format={(n) => {
            const v = Math.round(n)
            if (v === 0) return labels.moody
            if (v === 50) return labels.normal
            if (v === 100) return labels.bright
            return `${v}%`
          }}
          onChange={(n) => patch({ gamma: n === null ? null : n / 100 })}
          labels={labels}
        />
        <SliderRow
          icon={IconEye}
          label={labels.renderDistance}
          value={current.renderDistance}
          defaultValue={12}
          min={2}
          max={32}
          step={1}
          format={(n) => `${Math.round(n)} ${labels.chunks}`}
          onChange={(renderDistance) =>
            patch({ renderDistance: renderDistance === null ? null : Math.round(renderDistance) })
          }
          labels={labels}
        />
        <SliderRow
          icon={IconCpu}
          label={labels.simulationDistance}
          value={current.simulationDistance}
          defaultValue={12}
          min={5}
          max={32}
          step={1}
          format={(n) => `${Math.round(n)} ${labels.chunks}`}
          onChange={(simulationDistance) =>
            patch({
              simulationDistance: simulationDistance === null ? null : Math.round(simulationDistance),
            })
          }
          labels={labels}
        />
        <NullableBoolRow
          icon={IconNumbers}
          label={t('settings.minecraftInitial.showFps')}
          value={current.showFps}
          onChange={(showFps) => patch({ showFps })}
          labels={labels}
        />
        <NullableBoolRow
          icon={IconChartLine}
          label={t('settings.minecraftInitial.fpsExtended')}
          value={current.fpsExtended}
          onChange={(fpsExtended) => patch({ fpsExtended })}
          labels={labels}
        />
        <ChoiceList
          icon={IconContrast}
          label={t('settings.minecraftInitial.fpsContrast')}
          value={current.fpsTextContrast ?? ''}
          options={[
            { value: '', label: labels.mcDefault },
            { value: 'none', label: t('settings.minecraftInitial.fpsContrastNone') },
            { value: 'background', label: t('settings.minecraftInitial.fpsContrastBackground') },
            { value: 'shadow', label: t('settings.minecraftInitial.fpsContrastShadow') },
          ]}
          onChange={(raw) =>
            patch({
              fpsTextContrast:
                raw === 'none' || raw === 'background' || raw === 'shadow' ? raw : null,
            })
          }
        />
      </Group>

      <Group title={labels.audio} icon={IconVolume}>
        <SliderRow
          icon={IconVolume}
          label={labels.masterVolume}
          value={current.masterVolume === null ? null : current.masterVolume * 100}
          defaultValue={100}
          min={0}
          max={100}
          step={1}
          format={(n) => `${Math.round(n)}%`}
          onChange={(n) => patch({ masterVolume: n === null ? null : n / 100 })}
          labels={labels}
        />
        <SliderRow
          icon={IconMusic}
          label={labels.music}
          value={current.musicVolume === null ? null : current.musicVolume * 100}
          defaultValue={100}
          min={0}
          max={100}
          step={1}
          format={(n) => `${Math.round(n)}%`}
          onChange={(n) => patch({ musicVolume: n === null ? null : n / 100 })}
          labels={labels}
        />
        <SliderRow
          icon={IconCloudRain}
          label={t('settings.minecraftInitial.weather')}
          value={current.weatherVolume === null ? null : current.weatherVolume * 100}
          defaultValue={100}
          min={0}
          max={100}
          step={1}
          format={(n) => `${Math.round(n)}%`}
          onChange={(n) => patch({ weatherVolume: n === null ? null : n / 100 })}
          labels={labels}
        />
        <SliderRow
          icon={IconDisc}
          label={t('settings.minecraftInitial.record')}
          value={current.recordVolume === null ? null : current.recordVolume * 100}
          defaultValue={100}
          min={0}
          max={100}
          step={1}
          format={(n) => `${Math.round(n)}%`}
          onChange={(n) => patch({ recordVolume: n === null ? null : n / 100 })}
          labels={labels}
        />
        <SliderRow
          icon={IconCube}
          label={t('settings.minecraftInitial.block')}
          value={current.blockVolume === null ? null : current.blockVolume * 100}
          defaultValue={100}
          min={0}
          max={100}
          step={1}
          format={(n) => `${Math.round(n)}%`}
          onChange={(n) => patch({ blockVolume: n === null ? null : n / 100 })}
          labels={labels}
        />
      </Group>

      <Group title={labels.controls} icon={IconKeyboard}>
        <SliderRow
          icon={IconMouse}
          label={labels.mouseSensitivity}
          value={current.mouseSensitivity === null ? null : current.mouseSensitivity * 200}
          defaultValue={100}
          min={0}
          max={200}
          step={1}
          format={(n) => `${Math.round(n)}%`}
          onChange={(n) => patch({ mouseSensitivity: n === null ? null : n / 200 })}
          labels={labels}
        />
        <NullableBoolRow
          icon={IconCrown}
          label={t('settings.minecraftInitial.operatorItemsTab')}
          value={current.operatorItemsTab}
          onChange={(operatorItemsTab) => patch({ operatorItemsTab })}
          labels={labels}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <SettingLabel icon={IconKeyboard}>
              {t('settings.minecraftInitial.keybinds.label')}
            </SettingLabel>
            <p className="mt-0.5 pl-7 text-xs text-[var(--color-text-muted)]">
              {Object.keys(current.keybinds).length === 0
                ? t('settings.minecraftInitial.keybinds.summary_zero')
                : t('settings.minecraftInitial.keybinds.summary', {
                    count: Object.keys(current.keybinds).length,
                  })}
            </p>
          </div>
          <Button type="button" onClick={() => setKeybindsOpen(true)}>
            {t('settings.minecraftInitial.keybinds.open')}
          </Button>
        </div>
      </Group>

      <MinecraftKeybindsDialog
        open={keybindsOpen}
        value={current.keybinds}
        onChange={(keybinds) => patch({ keybinds })}
        onClose={() => setKeybindsOpen(false)}
      />
    </div>
  )
}
