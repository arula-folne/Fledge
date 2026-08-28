import { IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import type { ThemeMode } from '@fledge/shared'

export type SeasonTone = Extract<ThemeMode, 'light' | 'dark' | 'system'>

type Props = {
  value: SeasonTone
  onChange: (tone: SeasonTone) => void
}

const ORDER: SeasonTone[] = ['light', 'dark', 'system']

const ICONS = {
  light: IconSun,
  dark: IconMoon,
  system: IconDeviceDesktop,
} as const

/** シーズン・イベント用のコンパクトなライト／ダーク／システム切替 */
export function SeasonTonePicker({ value, onChange }: Props) {
  const { t } = useTranslation()
  return (
    <div className="flex justify-start" role="radiogroup" aria-label={t('settings.seasonTone')}>
      <div className="inline-flex overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-input)] p-0.5">
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
              onClick={() => onChange(tone)}
              className={[
                'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold transition-colors',
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
  )
}

export function coerceSeasonTone(mode: ThemeMode): SeasonTone {
  if (mode === 'dark' || mode === 'oled') return 'dark'
  if (mode === 'system') return 'system'
  return 'light'
}
