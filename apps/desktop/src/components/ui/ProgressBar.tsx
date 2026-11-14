import { memo } from 'react'

export const ProgressBar = memo(function ProgressBar({
  percent,
  className = '',
}: {
  percent: number
  className?: string
}) {
  const rounded = Number.isFinite(percent) ? Math.round(Math.min(100, Math.max(0, percent))) : 0
  const width = Math.max(4, rounded)
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-[var(--color-accent-soft)] ${className}`.trim()}>
      <div
        className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${width}%` }}
      />
    </div>
  )
})
