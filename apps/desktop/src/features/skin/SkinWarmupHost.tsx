import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { SkinEntry, SkinModel } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { loadSkinView3d, renderSkinThumbDataUrl } from '../../components/skin/skinSnapshot'
import { skinThumbQueryKey } from '../../components/skin/SkinCachedThumb'
import { defaultSkinTextureUrl } from '../../components/skin/defaultSkinUrls'
import { isTauriApp, localFileAssetUrl } from '../../components/skin/skinUrls'

/**
 * アプリ起動中はスキン関連を裏で温め続ける。
 * スキン画面に入った瞬間の待ちを減らす。
 */
export function SkinWarmupHost() {
  const queryClient = useQueryClient()

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => fledgeApi.settings.get(),
    staleTime: 60_000,
  })
  const skinsQuery = useQuery({
    queryKey: ['skins'],
    queryFn: () => fledgeApi.skins.list(),
    staleTime: 60_000,
  })

  useEffect(() => {
    void loadSkinView3d().catch(() => {
      /* 先読み失敗は画面側で再試行 */
    })
  }, [])

  useEffect(() => {
    const settings = settingsQuery.data
    const skins = skinsQuery.data
    if (!settings || !skins) return

    let cancelled = false

    const warm = async () => {
      const tauri = isTauriApp()
      const selectedId = settings.selectedSkinId
      const uploads = skins.filter((s) => s.source === 'upload')
      const selected = skins.find((s) => s.id === selectedId) ?? null
      const targets: SkinEntry[] = []
      if (selected) targets.push(selected)
      for (const u of uploads) {
        if (!targets.some((t) => t.id === u.id)) targets.push(u)
      }

      for (const skin of targets) {
        if (cancelled) return
        try {
          const bundled =
            skin.source === 'default' ? defaultSkinTextureUrl(skin.id) : undefined
          if (bundled) {
            void preloadImage(bundled)
          }

          const dataUrl = bundled
            ? null
            : await queryClient.fetchQuery({
                queryKey: ['skin-data', skin.id],
                queryFn: () => fledgeApi.skins.getDataUrl(skin.id),
                staleTime: 30 * 60_000,
              })
          if (dataUrl) void preloadImage(dataUrl)

          if (tauri && !bundled) {
            const path = await queryClient.fetchQuery({
              queryKey: ['skin-path', skin.id],
              queryFn: () => fledgeApi.skins.resolvePath(skin.id),
              staleTime: 30 * 60_000,
            })
            const asset = localFileAssetUrl(path)
            if (asset) queryClient.setQueryData(['skin-path-url', skin.id], asset)
          }
        } catch {
          /* 裏読みは失敗しても本画面で再試行 */
        }

        if (skin.source === 'upload') {
          await warmThumb(queryClient, skin.id, skin.model, cancelled)
        }
      }
    }

    const ric = window.requestIdleCallback
    let idleId: number | undefined
    let timerId: number | undefined
    if (typeof ric === 'function') {
      idleId = ric(() => {
        void warm()
      }, { timeout: 1200 })
    } else {
      timerId = window.setTimeout(() => {
        void warm()
      }, 150)
    }

    return () => {
      cancelled = true
      if (idleId != null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId)
      }
      if (timerId != null) window.clearTimeout(timerId)
    }
  }, [queryClient, settingsQuery.data, skinsQuery.data])

  return null
}

async function warmThumb(
  queryClient: ReturnType<typeof useQueryClient>,
  skinId: string,
  model: SkinModel,
  cancelled: boolean,
): Promise<void> {
  if (cancelled) return
  try {
    let thumb =
      queryClient.getQueryData<string | null>(skinThumbQueryKey(skinId, model)) ?? undefined
    if (thumb === undefined) {
      thumb =
        (await queryClient.fetchQuery({
          queryKey: skinThumbQueryKey(skinId, model),
          queryFn: () => fledgeApi.skins.getThumb(skinId, model),
          staleTime: 30 * 60_000,
        })) ?? undefined
    }
    if (thumb) {
      void preloadImage(thumb)
      return
    }

    const skinData =
      queryClient.getQueryData<string | null>(['skin-data', skinId]) ??
      (await fledgeApi.skins.getDataUrl(skinId))
    if (!skinData || cancelled) return
    queryClient.setQueryData(['skin-data', skinId], skinData)
    const dataUrl = await renderSkinThumbDataUrl(skinData, model)
    if (cancelled) return
    await fledgeApi.skins.saveThumb(skinId, model, dataUrl)
    queryClient.setQueryData(skinThumbQueryKey(skinId, model), dataUrl)
    void preloadImage(dataUrl)
  } catch {
    /* 欠損サムネは Skin 画面側で生成 */
  }
}

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.src = src
  })
}
