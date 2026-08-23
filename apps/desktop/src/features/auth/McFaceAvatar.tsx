type Props = {
  src: string
  size?: number
  radius?: 'sm' | 'md'
  className?: string
}

const radiusClass = {
  sm: 'rounded-[var(--radius-sm)]',
  md: 'rounded-[var(--radius-md)]',
} as const

/** Minecraft スキンの顔。表示サイズと画像解像度を揃え、等倍（pixelated）で描画する。 */
export function McFaceAvatar({ src, size = 32, radius = 'sm', className = '' }: Props) {
  return (
    <div
      className={[
        'shrink-0 overflow-hidden border border-[var(--color-border)] bg-[var(--color-accent-soft)]',
        radiusClass[radius],
        className,
      ].join(' ')}
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        draggable={false}
        referrerPolicy="no-referrer"
        className="block"
        style={{ width: size, height: size, imageRendering: 'pixelated' }}
      />
    </div>
  )
}
