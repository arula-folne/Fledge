import { useEffect, useState, type CSSProperties } from 'react'
import {
  IconContrast,
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

const MODE_ICON = {
  dark: IconMoon,
  light: IconSun,
  color: IconPalette,
  oled: IconContrast,
  system: IconDeviceDesktop,
} as const

const SKEW = 12

const COLOR_RAINBOW =
  'linear-gradient(135deg, #ff4d6d 0%, #ff9f1c 22%, #ffd60a 40%, #2ec4b6 58%, #4cc9f0 76%, #7b2cbf 100%)'

function previewBg(mode: ThemeMode): string {
  switch (mode) {
    case 'light':
      return '#e8e8ea'
    case 'dark':
      return '#2c2c2e'
    case 'oled':
      return '#000000'
    case 'system':
      return 'linear-gradient(90deg, #2c2c2e 0 50%, #e8e8ea 50% 100%)'
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
          const Icon = MODE_ICON[mode]
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={labels[mode]}
              title={labels[mode]}
              onClick={() => {
                setPending(mode)
                onChange(mode)
              }}
              className={[
                'relative h-[108px] min-w-0 flex-1',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]',
              ].join(' ')}
            >
              {/* 見た目: 角丸＋skew の平行四辺形（GPU で滑らか） */}
              <div
                className={[
                  'pointer-events-none absolute inset-y-0 inset-x-[4%] flex overflow-hidden rounded-[18px]',
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
              >
                {/* 中身だけ正立に戻す */}
                <div
                  className="flex h-full w-[130%] flex-col justify-end"
                  style={{
                    transform: `skewX(${SKEW}deg)`,
                    marginLeft: '-15%',
                  }}
                >
                  <div className="flex items-center justify-center gap-1 bg-black/55 px-1 py-2 backdrop-blur-[1px]">
                    <span
                      className={[
                        'grid size-3.5 shrink-0 place-items-center rounded-full border-2',
                        selected ? 'border-[var(--color-accent)]' : 'border-white/85',
                      ].join(' ')}
                      aria-hidden
                    >
                      {selected ? (
                        <span className="size-1.5 rounded-full bg-[var(--color-accent)]" />
                      ) : null}
                    </span>
                    <span className="truncate text-[11px] font-semibold leading-none text-white">
                      {labels[mode]}
                    </span>
                    <Icon size={13} stroke={1.75} className="shrink-0 text-white/95" aria-hidden />
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
