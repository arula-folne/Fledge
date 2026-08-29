import { useTranslation } from 'react-i18next'
import appIcon from '../../assets/app-icon.png'

type Props = {
  /** タイトルバーなど向けのコンパクト表示 */
  compact?: boolean
  /** サイドバー向け（文字をやや大きく） */
  sidebar?: boolean
  /** false のとき文字ロゴのみ */
  showIcon?: boolean
}

export function TextLogo({ compact = false, sidebar = false, showIcon = true }: Props) {
  const { t } = useTranslation()
  const iconSize = sidebar ? 22 : compact ? 17 : 28
  const textClass = sidebar
    ? 'text-[16px] font-semibold'
    : compact
      ? 'text-sm font-semibold'
      : 'text-xl font-semibold'
  return (
    <div className="flex items-center gap-2.5 leading-tight">
      {showIcon ? (
        <img
          src={appIcon}
          alt=""
          width={iconSize}
          height={iconSize}
          className="shrink-0 rounded-[22%] shadow-sm"
          draggable={false}
        />
      ) : null}
      <div className={['tracking-tight text-[var(--color-text)]', textClass].join(' ')}>
        {t('app.name')}
      </div>
    </div>
  )
}
