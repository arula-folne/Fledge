import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { SEASON_THEMES } from '../../styles/themeSeasons'

type Props = {
  value: string | null
  onChange: (id: string) => void
}

const SKEW = 12

/** スタンダードテーマと同じスキューカード表示 */
export function ThemeSeasonPicker({ value, onChange }: Props) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<string | null>(null)
  const current = pending ?? value

  useEffect(() => {
    // スタンダード側へ切り替わった／確定したら pending を捨てて排他表示を保つ
    if (value === null || (pending !== null && value === pending)) {
      setPending(null)
    }
  }, [value, pending])

  if (SEASON_THEMES.length === 0) return null

  return (
    <div
      className="w-full overflow-x-clip px-2"
      role="radiogroup"
      aria-label={t('settings.block.seasonTheme')}
    >
      <div className="flex w-full gap-2.5">
        {SEASON_THEMES.map((theme) => {
          const selected = current === theme.id
          const label = t(theme.labelKey)
          const preview = theme.illustration?.light
          return (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={label}
              title={label}
              onClick={() => {
                setPending(theme.id)
                onChange(theme.id)
              }}
              className={[
                'relative h-[108px] min-w-0',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-selection)]',
              ].join(' ')}
              style={{ flex: '1 1 0', maxWidth: 'calc((100% - 2.5rem) / 5)' }}
            >
              <div
                className={[
                  'pointer-events-none absolute inset-y-0 inset-x-[4%] flex overflow-hidden rounded-[18px]',
                  'transition-[box-shadow,filter]',
                  selected
                    ? 'z-[1] shadow-[0_0_0_2px_var(--color-selection)]'
                    : 'shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]',
                ].join(' ')}
                style={
                  {
                    transform: `skewX(-${SKEW}deg)`,
                    background: preview ? undefined : theme.previewBg,
                    backfaceVisibility: 'hidden',
                  } satisfies CSSProperties
                }
              >
                {preview ? (
                  <img
                    src={preview}
                    alt=""
                    className="absolute inset-0 h-full w-full max-w-none object-cover object-[center_68%]"
                    style={{
                      transform: `skewX(${SKEW}deg) scaleX(1.08)`,
                      width: '115%',
                      left: '-7.5%',
                    }}
                    draggable={false}
                  />
                ) : null}
                <div
                  className="relative z-[1] flex h-full w-[130%] flex-col justify-end"
                  style={{
                    transform: `skewX(${SKEW}deg)`,
                    marginLeft: '-15%',
                  }}
                >
                  <div className="flex items-center justify-center gap-1 bg-black/55 px-1 py-2 backdrop-blur-[1px]">
                    <span
                      className={[
                        'grid size-3.5 shrink-0 place-items-center rounded-full border-2',
                        selected ? 'border-[var(--color-selection)]' : 'border-white/85',
                      ].join(' ')}
                      aria-hidden
                    >
                      {selected ? (
                        <span className="size-1.5 rounded-full bg-[var(--color-selection)]" />
                      ) : null}
                    </span>
                    <span className="truncate text-[11px] font-semibold leading-none text-white">
                      {label}
                    </span>
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
