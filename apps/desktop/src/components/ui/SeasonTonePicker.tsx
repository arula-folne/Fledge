import { IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import type { ThemeMode } from '@fledge/shared'
import { HoverTip } from './HoverTip'

export type SeasonTone = Extract<ThemeMode, 'light' | 'dark' | 'system'>

type Props = {
  value: SeasonTone
  onChange: (tone: SeasonTone) => void
  /** ライト／ダーク非対応テーマ、または未選択時は無効表示 */
  disabled?: boolean
}

const ORDER: SeasonTone[] = ['light', 'dark', 'system']

const ICONS = {
  light: IconSun,
  dark: IconMoon,
  system: IconDeviceDesktop,
} as const

/** シーズン・イベント用のコンパクトなライト／ダーク／システム切替 */
export function SeasonTonePicker({ value, onChange, disabled = false }: Props) {
  const { t } = useTranslation()
  return (
    <HoverTip label={t('settings.seasonToneUnavailable')} disabled={!disabled}>
      <div
        className={['flex justify-start', disabled ? 'opacity-45' : ''].join(' ')}
        role="radiogroup"
        aria-label={t('settings.seasonTone')}
        aria-disabled={disabled}
      >
        <div
          className={[
            'inline-flex overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-input)] p-0.5',
            disabled ? 'pointer-events-none' : '',
          ].join(' ')}
        >
          {ORDER.map((tone) => {
            const selected = value === tone
            const Icon = ICONS[tone]
            return (
              <button
                key={tone}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={t(`settings.theme.${tone}`)}
                disabled={disabled}
                onClick={() => {
                  if (!disabled) onChange(tone)
                }}
                className={[
                  'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold transition-colors',
                  disabled ? 'cursor-not-allowed' : '',
                  selected
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-text)] shadow-[0_0_0_1px_var(--color-selection)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
                ].join(' ')}
              >
                <Icon size={13} stroke={1.75} aria-hidden />
                <span>{t(`settings.theme.${tone}`)}</span>
              </button>
            )
          })}
        </div>
      </div>
    </HoverTip>
  )
}

export function coerceSeasonTone(mode: ThemeMode): SeasonTone {
  if (mode === 'dark' || mode === 'oled') return 'dark'
  if (mode === 'system') return 'system'
  return 'light'
}
