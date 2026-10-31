import { useTranslation } from 'react-i18next'
import type { ContentCatalogProviderId } from '@fledge/shared'
import { SlidingPillTabs } from '../../components/ui/SlidingPillTabs'
import { CONTENT_CATALOG_PROVIDERS } from './contentCatalogProviders'

type Props = {
  active: ContentCatalogProviderId
  onChange: (provider: ContentCatalogProviderId) => void
  size?: 'sm' | 'md'
}

/** Modrinth ブランド緑 / Folne 水色 */
const PROVIDER_PILL_STYLE: Record<
  ContentCatalogProviderId,
  { activePillClassName: string; activeTextClassName: string; inactiveClassName: string }
> = {
  modrinth: {
    activePillClassName: 'bg-[#30B474]',
    activeTextClassName: 'text-white',
    inactiveClassName: 'hover:text-[#2A9E66]',
  },
  folne: {
    activePillClassName: 'bg-[#6EC8E8]',
    activeTextClassName: 'text-[#0a2a38]',
    inactiveClassName: 'hover:text-[#5BB8DA]',
  },
}

/** Modrinth / Folne の配布元切り替え（お気に入りは共通のまま） */
export function ContentProviderSourceTabs({ active, onChange, size = 'md' }: Props) {
  const { t } = useTranslation()

  return (
    <SlidingPillTabs
      size={size}
      className="w-fit max-w-full shrink-0 self-start"
      aria-label={t('content.provider.select')}
      activeId={active}
      onChange={(id) => onChange(id as ContentCatalogProviderId)}
      items={CONTENT_CATALOG_PROVIDERS.map((id) => {
        const style = PROVIDER_PILL_STYLE[id]
        return {
          id,
          label: t(`content.provider.${id}`),
          activePillClassName: style.activePillClassName,
          activeTextClassName: style.activeTextClassName,
          inactiveClassName: style.inactiveClassName,
        }
      })}
    />
  )
}
