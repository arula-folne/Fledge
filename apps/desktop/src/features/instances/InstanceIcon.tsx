import { useQuery } from '@tanstack/react-query'
import type { InstanceProfile } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'

type Size = 'md' | 'lg'

type Props = {
  instance?: Pick<InstanceProfile, 'id' | 'iconFile'>
  /** 作成ウィザードのプレビュー */
  previewSrc?: string | null
  size?: Size
  className?: string
}

const dimClass: Record<Size, string> = {
  md: 'size-12',
  lg: 'size-16',
}

const dimPx: Record<Size, number> = {
  md: 48,
  lg: 64,
}

/** 立体的なブロック（カスタムアイコンが無いときの既定） */
export function BlockIcon({ size = 48, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <polygon points="8,22 32,34 32,58 8,46" fill="#8B5A2B" />
      <polygon points="8,22 32,34 32,40 8,28" fill="#4F8F2C" />
      <polygon points="32,34 56,22 56,46 32,58" fill="#6B4423" />
      <polygon points="32,34 56,22 56,28 32,40" fill="#3F7A24" />
      <polygon points="32,8 56,22 32,34 8,22" fill="#62A83A" />
      <polygon points="32,8 44,15 32,21 20,15" fill="#8FD45A" opacity="0.45" />
      <polygon points="32,8 56,22 32,34 8,22" fill="none" stroke="#2F5A18" strokeWidth="0.6" />
    </svg>
  )
}

export function InstanceIcon({ instance, previewSrc, size = 'md', className = '' }: Props) {
  const iconQuery = useQuery({
    queryKey: ['instance-icon', instance?.id, instance?.iconFile],
    queryFn: () => fledgeApi.instances.getIcon(instance!.id),
    enabled: Boolean(instance?.id && instance?.iconFile) && !previewSrc,
    staleTime: 60_000,
  })

  const src = previewSrc || iconQuery.data || null
  const box = [
    dimClass[size],
    'relative flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-surface)]',
    className,
  ].join(' ')

  if (src) {
    return (
      <div className={box} aria-hidden>
        <img src={src} alt="" className="size-full object-cover" draggable={false} />
      </div>
    )
  }

  return (
    <div className={`${box} border border-[var(--color-border)]`} aria-hidden>
      <BlockIcon size={dimPx[size] - 8} />
    </div>
  )
}
