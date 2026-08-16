import { useEffect, useState, type CSSProperties } from 'react'
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
              <span
                className={[
                  'mt-auto truncate px-0.5 text-center text-xs font-semibold',
                  selected ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]',
                ].join(' ')}
              >
                {labels[mode]}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
