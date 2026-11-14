import { memo } from 'react'

/** Windows Update 風の円形プログレス。パーセントは円の下に表示。整数変化時のみ再描画。 */

export const CircularProgress = memo(function CircularProgress({
  percent,
  size = 44,
  strokeWidth = 3.5,
  className = '',
  labelClassName = '',
  showLabel = true,
}: {
  percent: number
  size?: number
  strokeWidth?: number
  className?: string
  labelClassName?: string
  showLabel?: boolean
}) {
  const safe = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0
  const display = Math.round(safe)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  // 整数%で stroke を動かし、小数 tick のコンポジタ負荷を避ける
  const offset = circumference * (1 - display / 100)

  return (
    <div
      className={['inline-flex flex-col items-center justify-center gap-1', className]
        .filter(Boolean)
        .join(' ')}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={display}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0 -rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-accent-soft)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-300 ease-out motion-reduce:transition-none"
        />
      </svg>
      {showLabel ? (
        <span
          className={[
            'tabular-nums text-[11px] font-semibold leading-none tracking-tight text-[var(--color-text)]',
            labelClassName,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {display}%
        </span>
      ) : null}
    </div>
  )
})
