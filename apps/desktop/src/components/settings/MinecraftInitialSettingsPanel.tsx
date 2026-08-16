import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { IconRefresh } from '@tabler/icons-react'
import { EMPTY_MINECRAFT_INITIAL_SETTINGS, type MinecraftInitialSettings } from '@fledge/shared'
import { MINECRAFT_LANGUAGES } from '../../data/minecraftLanguages'
import { Select } from '../ui/Select'
import { HoverTooltip } from '../ui/HoverTooltip'

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
  }
}

const ITEM_TEXT = 'text-[15px]'
const ITEM_SELECT_CLASS = 'text-[15px]'

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
      <span className={`${ITEM_TEXT} font-medium text-[var(--color-text)]`}>{labels.lang}</span>
      <button
        type="button"
        className={[
          'flex w-full items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-left text-[15px] text-[var(--color-text)] outline-none',
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
        <div className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={labels.langSearch}
            className="w-full border-b border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-[15px] text-[var(--color-text)] outline-none"
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
                      'flex w-full px-3 py-2 text-left text-[15px]',
                      selected
                        ? 'bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]'
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
  const t = rect.width <= 0 ? 0 : (clientX - rect.left) / rect.width
  const raw = min + clamp(t, 0, 1) * (max - min)
  const stepped = Math.round(raw / step) * step
  return clamp(Number(stepped.toFixed(6)), min, max)
}

function NullableBoolRow({
  label,
  value,
  onChange,
  labels,
}: {
  label: string
  value: boolean | null
  onChange: (next: boolean | null) => void
  labels: Props['labels']
}) {
  return (
    <Select
      label={label}
      labelClassName={`${ITEM_TEXT} font-medium text-[var(--color-text)]`}
      className={ITEM_SELECT_CLASS}
      value={value === null ? '' : value ? 'on' : 'off'}
      options={[
        { value: '', label: labels.mcDefault },
        { value: 'on', label: labels.on },
        { value: 'off', label: labels.off },
      ]}
      onChange={(e) => {
        const v = e.currentTarget.value
        onChange(v === 'on' ? true : v === 'off' ? false : null)
      }}
    />
  )
}

function ResetButton({
  label,
  disabled,
  onClick,
}: {
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <HoverTooltip
      disabled={disabled}
      content={<span className="text-xs font-medium text-[var(--color-text)]">{label}</span>}
    >
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        className={[
          'flex size-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)]',
          disabled
            ? 'cursor-default text-[var(--color-text-muted)] opacity-45'
            : 'text-[var(--color-text)] hover:bg-[var(--color-hover)]',
        ].join(' ')}
        onClick={onClick}
      >
        <IconRefresh size={18} stroke={1.75} />
      </button>
    </HoverTooltip>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  labels,
}: {
  label: string
  value: number | null
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
  const ratio = ((display ?? min) - min) / (max - min || 1)
  const percent = clamp(ratio, 0, 1) * 100

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
    <div className="w-full">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className={`${ITEM_TEXT} font-medium text-[var(--color-text)]`}>{label}</span>
        <span className={`shrink-0 ${ITEM_TEXT} tabular-nums text-[var(--color-text)]`}>
          {display === null ? labels.mcDefault : format(display)}
        </span>
      </div>
      <div className="flex w-full items-center gap-2">
        <div className="min-w-0 flex-1 px-5">
          <div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            aria-label={label}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={display === null ? undefined : Math.round(display)}
            aria-valuetext={display === null ? labels.mcDefault : format(display)}
            className={[
              'relative flex h-10 w-full cursor-grab items-center touch-none select-none active:cursor-grabbing',
              display === null ? 'opacity-55' : '',
            ].join(' ')}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishPointer}
            onPointerCancel={finishPointer}
            onKeyDown={(e) => {
              const current = display ?? min
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
            <div className="pointer-events-none absolute inset-x-0 h-2 overflow-hidden rounded-full bg-[var(--color-border)]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)]"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div
              className="pointer-events-none absolute z-10 flex size-9 -translate-x-1/2 items-center justify-center"
              style={{ left: `${percent}%` }}
              aria-hidden
            >
              <div className="size-4 rounded-full border-2 border-[var(--color-accent)] bg-[var(--color-surface)] shadow-md" />
            </div>
          </div>
        </div>
        <ResetButton
          label={labels.reset}
          disabled={display === null}
          onClick={() => {
            setOptimistic(null)
            setDraft(null)
            onChange(null)
          }}
        />
      </div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 border-t border-[var(--color-border)] pt-4 first:border-t-0 first:pt-0">
      <h3 className={`${ITEM_TEXT} font-semibold text-[var(--color-text)]`}>{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

export function MinecraftInitialSettingsPanel({ value, onChange, labels }: Props) {
  const current = { ...EMPTY_MINECRAFT_INITIAL_SETTINGS, ...value }
  const patch = (partial: Partial<MinecraftInitialSettings>) =>
    onChange({ ...current, ...partial })

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">{labels.hint}</p>

      <Group title={labels.game}>
        <LanguageSelect
          value={current.lang}
          onChange={(lang) => patch({ lang })}
          labels={labels}
        />
        <NullableBoolRow
          label={labels.subtitles}
          value={current.showSubtitles}
          onChange={(showSubtitles) => patch({ showSubtitles })}
          labels={labels}
        />
        <NullableBoolRow
          label={labels.autoJump}
          value={current.autoJump}
          onChange={(autoJump) => patch({ autoJump })}
          labels={labels}
        />
        <SliderRow
          label={labels.fov}
          value={current.fovDegrees}
          min={30}
          max={110}
          step={1}
          format={(n) => `${Math.round(n)}${labels.degrees}`}
          onChange={(fovDegrees) => patch({ fovDegrees })}
          labels={labels}
        />
      </Group>

      <Group title={labels.audio}>
        <SliderRow
          label={labels.masterVolume}
          value={current.masterVolume === null ? null : current.masterVolume * 100}
          min={0}
          max={100}
          step={1}
          format={(n) => `${Math.round(n)}%`}
          onChange={(n) => patch({ masterVolume: n === null ? null : n / 100 })}
          labels={labels}
        />
        <SliderRow
          label={labels.music}
          value={current.musicVolume === null ? null : current.musicVolume * 100}
          min={0}
          max={100}
          step={1}
          format={(n) => `${Math.round(n)}%`}
          onChange={(n) => patch({ musicVolume: n === null ? null : n / 100 })}
          labels={labels}
        />
      </Group>

      <Group title={labels.video}>
        <SliderRow
          label={labels.maxFps}
          value={current.maxFps}
          min={10}
          max={260}
          step={1}
          format={(n) => (n >= 260 ? labels.unlimited : `${Math.round(n)}`)}
          onChange={(maxFps) => patch({ maxFps: maxFps === null ? null : Math.round(maxFps) })}
          labels={labels}
        />
        <NullableBoolRow
          label={labels.vsync}
          value={current.enableVsync}
          onChange={(enableVsync) => patch({ enableVsync })}
          labels={labels}
        />
        <Select
          label={labels.fpsCondition}
          labelClassName={`${ITEM_TEXT} font-medium text-[var(--color-text)]`}
          className={ITEM_SELECT_CLASS}
          value={current.inactivityFpsLimit ?? ''}
          options={[
            { value: '', label: labels.mcDefault },
            { value: 'afk', label: labels.fpsConditionAfk },
            { value: 'minimized', label: labels.fpsConditionMinimized },
          ]}
          onChange={(e) =>
            patch({
              inactivityFpsLimit:
                e.currentTarget.value === 'afk' || e.currentTarget.value === 'minimized'
                  ? e.currentTarget.value
                  : null,
            })
          }
        />
        <Select
          label={labels.guiScale}
          labelClassName={`${ITEM_TEXT} font-medium text-[var(--color-text)]`}
          className={ITEM_SELECT_CLASS}
          value={current.guiScale === null ? '' : String(current.guiScale)}
          options={[
            { value: '', label: labels.mcDefault },
            { value: '0', label: labels.guiScaleAuto },
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3', label: '3' },
            { value: '4', label: '4' },
          ]}
          onChange={(e) => {
            const raw = e.currentTarget.value
            patch({ guiScale: raw === '' ? null : Number(raw) })
          }}
        />
        <SliderRow
          label={labels.brightness}
          value={current.gamma === null ? null : current.gamma * 100}
          min={0}
          max={100}
          step={1}
          format={(n) => `${Math.round(n)}%`}
          onChange={(n) => patch({ gamma: n === null ? null : n / 100 })}
          labels={labels}
        />
        <SliderRow
          label={labels.renderDistance}
          value={current.renderDistance}
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
          label={labels.simulationDistance}
          value={current.simulationDistance}
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
      </Group>

      <Group title={labels.controls}>
        <SliderRow
          label={labels.mouseSensitivity}
          value={current.mouseSensitivity === null ? null : current.mouseSensitivity * 200}
          min={0}
          max={200}
          step={1}
          format={(n) => `${Math.round(n)}%`}
          onChange={(n) => patch({ mouseSensitivity: n === null ? null : n / 200 })}
          labels={labels}
        />
      </Group>
    </div>
  )
}
