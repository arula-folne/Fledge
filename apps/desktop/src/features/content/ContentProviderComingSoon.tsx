import { useTranslation } from 'react-i18next'
import type { ContentCatalogProviderId } from '@fledge/shared'

type Props = {
  provider: ContentCatalogProviderId
}

/** 未公開の配布カタログ用プレースホルダ */
export function ContentProviderComingSoon({ provider }: Props) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg)]/40 px-4 py-10 text-center">
      <p className="text-base font-semibold text-[var(--color-text)]">
        {t('content.provider.comingSoon')}
      </p>
      <p className="max-w-sm text-sm text-[var(--color-text-muted)]">
        {t('content.provider.comingSoonBody', {
          name: t(`content.provider.${provider}`),
        })}
      </p>
    </div>
  )
}
