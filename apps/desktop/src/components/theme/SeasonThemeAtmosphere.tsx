import { getSeasonTheme } from '../../styles/themeSeasons'

type Props = {
  seasonId: string
  dark: boolean
}

/** シーズンテーマのイラスト背景＋さざ波モーション */
export function SeasonThemeAtmosphere({ seasonId, dark }: Props) {
  const season = getSeasonTheme(seasonId)
  const src = dark ? season?.illustration?.dark : season?.illustration?.light
  if (!src) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <img
        src={src}
        alt=""
        className="season-illustration h-full w-full object-cover object-[center_62%]"
        draggable={false}
      />
      <div
        className={[
          'absolute inset-0',
          dark
            ? 'bg-gradient-to-b from-[#0b1c2a]/55 via-[#102a43]/25 to-[#0b1c2a]/50'
            : 'bg-gradient-to-b from-[#c8dff0]/45 via-transparent to-[#e6c992]/35',
        ].join(' ')}
      />
      <svg
        className="absolute inset-x-0 bottom-0 h-[38%] w-full opacity-55"
        viewBox="0 0 1200 320"
        preserveAspectRatio="none"
      >
        <path
          className="season-wave season-wave-a"
          fill={dark ? 'rgba(78, 184, 201, 0.22)' : 'rgba(255, 255, 255, 0.42)'}
          d="M0 180 C160 140 280 220 420 180 C560 140 680 120 820 170 C960 220 1080 150 1200 175 L1200 320 L0 320 Z"
        />
        <path
          className="season-wave season-wave-b"
          fill={dark ? 'rgba(160, 210, 230, 0.14)' : 'rgba(31, 143, 181, 0.18)'}
          d="M0 210 C200 170 340 250 500 205 C660 160 780 150 940 200 C1060 235 1140 195 1200 210 L1200 320 L0 320 Z"
        />
      </svg>
    </div>
  )
}
