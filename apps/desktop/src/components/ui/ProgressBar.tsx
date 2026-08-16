export function ProgressBar({
  percent,
  className = '',
}: {
  percent: number
  className?: string
}) {
  const width = Number.isFinite(percent) ? Math.min(100, Math.max(4, percent)) : 8
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-[var(--color-accent-soft)] ${className}`.trim()}>
      <div
        className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-150"
        style={{ width: `${width}%` }}
      />
    </div>
  )
}
