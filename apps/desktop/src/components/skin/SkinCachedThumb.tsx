import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { SkinModel } from '@fledge/shared'
import { SKIN_THUMB_VERSION } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { renderSkinThumbDataUrl } from './skinSnapshot'
import { isTauriApp, localFileAssetUrl } from './skinUrls'

type Props = {
  skinId: string
  model: SkinModel
  /** 既に持っている場合のみ渡す。無いときはサムネ欠損時にだけ取得する */
  skinUrl?: string | null
  className?: string
}

export function skinThumbQueryKey(skinId: string, model: SkinModel) {
  return ['skin-thumb', SKIN_THUMB_VERSION, skinId, model] as const
}

export function skinThumbPathQueryKey(skinId: string, model: SkinModel) {
  return ['skin-thumb-path', SKIN_THUMB_VERSION, skinId, model] as const
}

const inflight = new Map<string, Promise<void>>()

/**
 * アップロードスキンの保存済みサムネ。
 * 表示は data URL（確実）。生成用ソースは path→asset を優先。
 */
export function SkinCachedThumb({ skinId, model, skinUrl, className = '' }: Props) {
  const queryClient = useQueryClient()
  const tauri = isTauriApp()
  const [brokenAsset, setBrokenAsset] = useState(false)

  const thumbQuery = useQuery({
    queryKey: skinThumbQueryKey(skinId, model),
    queryFn: () => fledgeApi.skins.getThumb(skinId, model),
    staleTime: 30 * 60_000,
    gcTime: 15 * 60_000,
  })

  const pathQuery = useQuery({
    queryKey: skinThumbPathQueryKey(skinId, model),
    queryFn: () => fledgeApi.skins.resolveThumbPath(skinId, model),
    enabled: tauri && !thumbQuery.data,
    staleTime: 30 * 60_000,
    gcTime: 15 * 60_000,
  })

  const assetUrl =
    !brokenAsset && !thumbQuery.data ? localFileAssetUrl(pathQuery.data) : undefined

  const missingThumb = thumbQuery.isSuccess && thumbQuery.data == null && !assetUrl

  const sourceQuery = useQuery({
    queryKey: tauri ? ['skin-path-url', skinId] : ['skin-data', skinId],
    queryFn: async () => {
      if (tauri) {
        const path = await fledgeApi.skins.resolvePath(skinId)
        const asset = localFileAssetUrl(path)
        if (asset) return asset
        return fledgeApi.skins.getDataUrl(skinId)
      }
      return fledgeApi.skins.getDataUrl(skinId)
    },
    enabled: missingThumb && !skinUrl,
    staleTime: 30 * 60_000,
    gcTime: 15 * 60_000,
  })

  const resolvedUrl = skinUrl ?? sourceQuery.data ?? undefined

  useEffect(() => {
    setBrokenAsset(false)
  }, [skinId, model, pathQuery.data])

  useEffect(() => {
    if (!missingThumb || !resolvedUrl) return
    const key = `${skinId}:${model}`
    let task = inflight.get(key)
    if (!task) {
      task = (async () => {
        const dataUrl = await renderSkinThumbDataUrl(resolvedUrl, model)
        await fledgeApi.skins.saveThumb(skinId, model, dataUrl)
        queryClient.setQueryData(skinThumbQueryKey(skinId, model), dataUrl)
        if (tauri) {
          const nextPath = await fledgeApi.skins.resolveThumbPath(skinId, model)
          queryClient.setQueryData(skinThumbPathQueryKey(skinId, model), nextPath)
        }
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
  }, [missingThumb, resolvedUrl, skinId, model, queryClient, tauri])

  const src = thumbQuery.data ?? assetUrl ?? undefined

  return (
    <div className={['relative h-full w-full', className].join(' ')}>
      {!src ? <div className="absolute inset-0 animate-pulse bg-[var(--color-border)]/25" /> : null}
      {src ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-contain"
          draggable={false}
          decoding="async"
          onError={() => {
            if (assetUrl && src === assetUrl) setBrokenAsset(true)
          }}
        />
      ) : null}
    </div>
  )
}
