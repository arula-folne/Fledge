import { useQuery } from '@tanstack/react-query'
import type { InstanceIconPreset, InstanceProfile } from '@fledge/shared'
import { DEFAULT_INSTANCE_ICON_PRESET } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { InstanceIconTile } from './instanceIconPresets'

type Size = 'sm' | 'md' | 'lg'

type Props = {
  instance?: Pick<InstanceProfile, 'id' | 'iconFile' | 'iconPreset'>
  /** 作成ウィザードのカスタム画像プレビュー */
  previewSrc?: string | null
  /** 作成ウィザードのプリセットプレビュー */
  preset?: InstanceIconPreset | null
  size?: Size
  className?: string
}

const dimClass: Record<Size, string> = {
  sm: 'size-8',
  md: 'size-12',
  lg: 'size-16',
}

export function InstanceIcon({
  instance,
  previewSrc,
  preset,
  size = 'md',
  className = '',
}: Props) {
  const iconQuery = useQuery({
    queryKey: ['instance-icon', instance?.id, instance?.iconFile],
    queryFn: () => fledgeApi.instances.getIcon(instance!.id),
    enabled: Boolean(instance?.id && instance?.iconFile) && !previewSrc,
    staleTime: 60_000,
    gcTime: 3 * 60_000,
  })

  const src = previewSrc || iconQuery.data || null
  if (src) {
    return (
      <div
        className={[
          dimClass[size],
          'relative flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-surface)]',
          className,
        ].join(' ')}
        aria-hidden
      >
        <img src={src} alt="" className="size-full object-cover" draggable={false} />
      </div>
    )
  }

  return (
    <InstanceIconTile
      preset={preset ?? instance?.iconPreset ?? DEFAULT_INSTANCE_ICON_PRESET}
      size={size}
      className={className}
    />
  )
}
