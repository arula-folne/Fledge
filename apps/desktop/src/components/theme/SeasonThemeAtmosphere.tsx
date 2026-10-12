import { getSeasonTheme } from '../../styles/themeSeasons'
import { ThemeIllustrationAtmosphere } from './ThemeIllustrationAtmosphere'

type Props = {
  seasonId: string | null
  dark: boolean
}

/** シーズンテーマのイラスト背景（互換ラッパー） */
export function SeasonThemeAtmosphere({ seasonId, dark }: Props) {
  const season = seasonId ? getSeasonTheme(seasonId) : undefined
  const src = dark
    ? (season?.illustration?.dark ?? season?.illustration?.light)
    : (season?.illustration?.light ?? season?.illustration?.dark)
  const overlayClass = dark
    ? season?.atmosphere.dark.overlayClass
    : season?.atmosphere.light.overlayClass
  const layerKey = seasonId && src && overlayClass ? `${seasonId}:${dark ? 'dark' : 'light'}` : null

  return (
    <ThemeIllustrationAtmosphere layerKey={layerKey} src={src} overlayClass={overlayClass} />
  )
}
