import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { SkinModel } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { renderSkinThumbDataUrl } from './skinSnapshot'

type Props = {
  skinId: string
  model: SkinModel
  skinUrl: string | null | undefined
  className?: string
}

export function skinThumbQueryKey(skinId: string, model: SkinModel) {
  return ['skin-thumb', skinId, model] as const
}

const inflight = new Map<string, Promise<void>>()

/**
 * アップロードスキンの保存済み 3D スナップショット。未生成なら一度だけ作って保存する。
 */
export function SkinCachedThumb({ skinId, model, skinUrl, className = '' }: Props) {
  const queryClient = useQueryClient()
  const thumbQuery = useQuery({
    queryKey: skinThumbQueryKey(skinId, model),
    queryFn: () => fledgeApi.skins.getThumb(skinId, model),
    staleTime: 30 * 60_000,
    gcTime: 15 * 60_000,
  })

  useEffect(() => {
    if (!thumbQuery.isSuccess || thumbQuery.data != null || !skinUrl) return
    const key = `${skinId}:${model}`
    let task = inflight.get(key)
    if (!task) {
      task = (async () => {
        const dataUrl = await renderSkinThumbDataUrl(skinUrl, model)
        await fledgeApi.skins.saveThumb(skinId, model, dataUrl)
        queryClient.setQueryData(skinThumbQueryKey(skinId, model), dataUrl)
      })()
        .catch((err: unknown) => {
          console.error('Skin thumb cache failed:', err)
        })
        .finally(() => {
          inflight.delete(key)
        })
      inflight.set(key, task)
    }
    void task
  }, [thumbQuery.isSuccess, thumbQuery.data, skinUrl, skinId, model, queryClient])

  const src = thumbQuery.data

  return (
    <div className={['relative h-full w-full', className].join(' ')}>
      {!src ? <div className="absolute inset-0 animate-pulse bg-[var(--color-border)]/25" /> : null}
      {src ? (
        <img src={src} alt="" className="h-full w-full object-contain" draggable={false} />
      ) : null}
    </div>
  )
}
