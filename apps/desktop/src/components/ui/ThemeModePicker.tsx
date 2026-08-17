import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  IconCircleLetterD,
  IconDeviceDesktop,
  IconMoon,
  IconPalette,
  IconSun,
} from '@tabler/icons-react'
import type { ThemeMode } from '@fledge/shared'

type Props = {
  value: ThemeMode
  labels: Record<ThemeMode, string>
  onChange: (mode: ThemeMode) => void
}

const ORDER: ThemeMode[] = ['light', 'dark', 'oled', 'color', 'system']

const SKEW = 12

const COLOR_RAINBOW =
  'linear-gradient(135deg, #ff4d6d 0%, #ff9f1c 22%, #ffd60a 40%, #2ec4b6 58%, #4cc9f0 76%, #7b2cbf 100%)'

const ICON_PROPS = { size: 16, stroke: 1.75 } as const

function previewBg(mode: ThemeMode): string {
  switch (mode) {
    case 'light':
      return '#e4e1dc'
    case 'dark':
      return '#2c2c2e'
    case 'oled':
      return '#000000'
    case 'system':
      return 'linear-gradient(90deg, #2c2c2e 0 50%, #e4e1dc 50% 100%)'
    case 'color':
      return COLOR_RAINBOW
  }
}

function ModeIcon({ mode }: { mode: ThemeMode }) {
  switch (mode) {
    case 'light':
      return <IconSun {...ICON_PROPS} />
    case 'dark':
      return <IconMoon {...ICON_PROPS} />
    case 'color':
      return <IconPalette {...ICON_PROPS} />
    case 'oled':
      return <IconCircleLetterD {...ICON_PROPS} />
    case 'system':
      return <IconDeviceDesktop {...ICON_PROPS} />
  }
}

function RadioMark({ selected }: { selected: boolean }) {
  return (
    <span
      className={[
        'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
        selected ? 'border-[var(--color-accent)]' : 'border-current opacity-55',
      ].join(' ')}
      aria-hidden
    >
      {selected ? <span className="h-2 w-2 rounded-full bg-[var(--color-accent)]" /> : null}
    </span>
  )
}

function LabelBar({
  selected,
  label,
  icon,
}: {
  selected: boolean
  label: string
  icon: ReactNode
}) {
  return (
    <span
      className={[
        'mt-auto grid h-7 w-full grid-cols-[18px_minmax(0,1fr)_18px] items-center gap-0.5 px-0.5',
        selected ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]',
      ].join(' ')}
    >
      <RadioMark selected={selected} />
      <span className="min-w-0 truncate text-center text-xs font-semibold leading-none">{label}</span>
      <span className="flex justify-end text-current">{icon}</span>
    </span>
  )
}

export function ThemeModePicker({ value, labels, onChange }: Props) {
  const [pending, setPending] = useState<ThemeMode | null>(null)
  const current = pending ?? value

  useEffect(() => {
    if (pending !== null && value === pending) setPending(null)
  }, [value, pending])

  return (
    <div className="w-full overflow-x-clip px-2" role="radiogroup" aria-label="theme">
      <div className="flex w-full gap-2.5">
        {ORDER.map((mode) => {
          const selected = current === mode
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={labels[mode]}
              onClick={() => {
                setPending(mode)
                onChange(mode)
              }}
              className={[
                'relative flex h-[124px] min-w-0 flex-1 flex-col',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]',
              ].join(' ')}
            >
              <div
                className={[
                  'pointer-events-none absolute inset-x-[4%] top-0 bottom-7 overflow-hidden rounded-[18px]',
                  'transition-[box-shadow,filter]',
                  selected
                    ? 'z-[1] shadow-[0_0_0_2px_var(--color-accent)]'
                    : mode === 'oled'
                      ? 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)]'
                      : 'shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]',
                ].join(' ')}
                style={
                  {
                    transform: `skewX(-${SKEW}deg)`,
                    background: previewBg(mode),
                    backfaceVisibility: 'hidden',
                  } satisfies CSSProperties
                }
              />
              <LabelBar selected={selected} label={labels[mode]} icon={<ModeIcon mode={mode} />} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
