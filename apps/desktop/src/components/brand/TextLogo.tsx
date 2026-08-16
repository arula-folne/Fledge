import { useTranslation } from 'react-i18next'
import appIcon from '../../assets/app-icon.png'

type Props = {
  /** タイトルバーなど向けのコンパクト表示 */
  compact?: boolean
  /** false のとき文字ロゴのみ */
  showIcon?: boolean
}

export function TextLogo({ compact = false, showIcon = true }: Props) {
  const { t } = useTranslation()
  const size = compact ? 17 : 28
  return (
    <div className="flex items-center gap-2.5 leading-tight">
      {showIcon ? (
        <img
          src={appIcon}
          alt=""
          width={size}
          height={size}
          className="shrink-0 rounded-[22%] shadow-sm"
          draggable={false}
        />
      ) : null}
      <div
        className={[
          'font-semibold tracking-tight text-[var(--color-text)]',
          compact ? 'text-sm' : 'text-xl',
        ].join(' ')}
      >
        {t('app.name')}
      </div>
    </div>
  )
}
