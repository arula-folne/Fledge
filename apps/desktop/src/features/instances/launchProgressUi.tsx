/** 起動プログレス — ウィンドウ幅に応じて clamp で統一スケール */
export const LAUNCH_PROGRESS_WIDTH = 'w-[clamp(11rem,16vw,15rem)]'
export const LAUNCH_PROGRESS_SLOT =
  'flex min-h-[1.375rem] flex-col justify-center ' + LAUNCH_PROGRESS_WIDTH

const MESSAGE =
  'text-[clamp(10px,9px+0.2vw,12px)] leading-snug text-[var(--color-text-muted)]'
const TRACK =
  'h-[clamp(3px,2px+0.25vw,5px)] overflow-hidden rounded-full bg-[var(--color-accent-soft)]'
const FILL = 'h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-150'

type IndicatorProps = {
  message: string
  percent: number
  compact?: boolean
}

export function LaunchProgressIndicator({ message, percent, compact = false }: IndicatorProps) {
  const width = Math.min(100, Math.max(4, percent))
  return (
    <div className="space-y-1">
      <div className={[MESSAGE, compact ? 'break-words' : ''].filter(Boolean).join(' ')}>{message}</div>
      <div className={TRACK}>
        <div className={FILL} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}
