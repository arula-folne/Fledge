import { useTranslation } from 'react-i18next'
import { IconSearch } from '@tabler/icons-react'

type Props = {
  query: string
  onQueryChange: (value: string) => void
  placeholder: string
}

/** コンテンツ検索の入力欄 */
export function ContentSearchBar({ query, onQueryChange, placeholder }: Props) {
  const { t } = useTranslation()

  return (
    <div className="relative w-full">
      <IconSearch
        size={16}
        stroke={1.75}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
        aria-hidden
      />
      <input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={placeholder}
        aria-label={t('content.browseTitle')}
        className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-input)] py-1.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--color-accent)]"
      />
    </div>
  )
}
