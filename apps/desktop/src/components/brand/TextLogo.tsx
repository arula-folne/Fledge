import { useTranslation } from 'react-i18next'

export function TextLogo() {
  const { t } = useTranslation()
  return (
    <div className="leading-tight">
      <div className="text-xl font-semibold tracking-tight text-[var(--color-text)]">
        {t('app.name')}
      </div>
    </div>
  )
}
