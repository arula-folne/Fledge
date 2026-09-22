import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { SEASON_THEMES, type SeasonThemeDefinition } from '../../styles/themeSeasons'
import {
  ThemePreviewDialog,
  ThemePreviewZoomButton,
  type ThemePreviewContent,
} from './ThemePreview'

type Props = {
  value: string | null
  onChange: (id: string) => void
  /** radiogroup の aria-label（省略時はシーズン見出し） */
  ariaLabel?: string
}

const SKEW = 12

function seasonPreviewContent(
  label: string,
  illustration: SeasonThemeDefinition['illustration'],
  fallbackBg: string,
): ThemePreviewContent {
  if (illustration?.light && illustration.dark) {
    return { kind: 'tone-image', label, light: illustration.light, dark: illustration.dark }
  }
  if (illustration?.light) {
    return { kind: 'image', label, src: illustration.light }
  }
  if (illustration?.dark) {
    return { kind: 'image', label, src: illustration.dark }
  }
  return { kind: 'swatch', label, background: fallbackBg }
}

/** スタンダードテーマと同じスキューカード表示 */
export function ThemeSeasonPicker({ value, onChange, ariaLabel }: Props) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<string | null>(null)
  const [preview, setPreview] = useState<ThemePreviewContent | null>(null)
  const current = pending ?? value
  const themes = SEASON_THEMES

  useEffect(() => {
    // スタンダード側へ切り替わった／確定したら pending を捨てて排他表示を保つ
    if (value === null || (pending !== null && value === pending)) {
      setPending(null)
    }
  }, [value, pending])

  if (themes.length === 0) return null

  return (
    <>
      <div
        className="w-full overflow-x-clip px-2"
        role="radiogroup"
        aria-label={ariaLabel ?? t('settings.block.seasonTheme')}
      >
        <div className="flex w-full gap-2.5">
          {themes.map((theme) => {
            const selected = current === theme.id
            const label = t(theme.labelKey)
            const lightSrc = theme.illustration?.light
            const darkSrc = theme.illustration?.dark
            const split = Boolean(lightSrc && darkSrc)
            return (
              <div
                key={theme.id}
                className="relative h-[108px] min-w-0"
                style={{ flex: '1 1 0', maxWidth: 'calc((100% - 2.5rem) / 5)' }}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={label}
                  onClick={() => {
                    setPending(theme.id)
                    onChange(theme.id)
                  }}
                  className={[
                    'absolute inset-0',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-selection)]',
                  ].join(' ')}
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
                        background: lightSrc || darkSrc ? undefined : theme.previewBg,
                        backfaceVisibility: 'hidden',
                      } satisfies CSSProperties
                    }
                  >
                    {split ? (
                      <div className="absolute inset-0 flex">
                        <div className="relative h-full w-1/2 overflow-hidden">
                          <img
                            src={lightSrc}
                            alt=""
                            className="absolute inset-0 h-full max-w-none object-cover object-[center_68%]"
                            style={{
                              transform: `skewX(${SKEW}deg) scaleX(1.08)`,
                              width: '230%',
                              left: '-15%',
                            }}
                            draggable={false}
                          />
                        </div>
                        <div className="relative h-full w-1/2 overflow-hidden">
                          <img
                            src={darkSrc}
                            alt=""
                            className="absolute inset-0 h-full max-w-none object-cover object-[center_68%]"
                            style={{
                              transform: `skewX(${SKEW}deg) scaleX(1.08)`,
                              width: '230%',
                              left: '-115%',
                            }}
                            draggable={false}
                          />
                        </div>
                      </div>
                    ) : lightSrc || darkSrc ? (
                      <img
                        src={lightSrc ?? darkSrc}
                        alt=""
                        className="absolute left-1/2 top-1/2 max-w-none"
                        style={{
                          // 親の skew を打ち消しつつ、高さ基準で拡大してアスペクトを保つ（つぶれ防止）
                          height: '185%',
                          width: 'auto',
                          transform: `translate(-50%, -50%) skewX(${SKEW}deg)`,
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
                <ThemePreviewZoomButton
                  onOpen={() =>
                    setPreview(seasonPreviewContent(label, theme.illustration, theme.previewBg))
                  }
                />
              </div>
            )
          })}
        </div>
      </div>
      <ThemePreviewDialog open={preview !== null} preview={preview} onClose={() => setPreview(null)} />
    </>
  )
}
