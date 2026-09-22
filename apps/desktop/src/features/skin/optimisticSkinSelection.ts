import type { QueryClient } from '@tanstack/react-query'
import type { Settings, SkinEntry, SkinModel } from '@fledge/shared'
import { fledgeApi } from '../../api/fledgeApi'
import { cropSkinFaceDataUrl } from '../auth/skinFace'
import { localFileAssetUrl, preferElectronDefaultProtocol } from '../../components/skin/skinUrls'

export function patchSelectedSkinSettings(
  queryClient: QueryClient,
  skinId: string,
  model: SkinModel,
): Settings | undefined {
  let next: Settings | undefined
  queryClient.setQueryData<Settings>(['settings'], (prev) => {
    if (!prev) return prev
    next = { ...prev, selectedSkinId: skinId, skinModel: model }
    return next
  })
  return next
}

/** 選択スキンからアカウント顔をローカルで即描画（Microsoft API 待ちを避ける） */
export async function prefetchAccountFaceFromLocalSkin(
  queryClient: QueryClient,
  skinId: string,
  skins: SkinEntry[],
): Promise<void> {
  let src =
    queryClient.getQueryData<string | null>(['skin-data', skinId]) ??
    queryClient.getQueryData<string | null>(['skin-path-url', skinId]) ??
    undefined

  if (!src) {
    try {
      const entry = skins.find((s) => s.id === skinId)
      const electronDefault = entry ? preferElectronDefaultProtocol(entry) : undefined
      if (electronDefault) {
        src = electronDefault
      } else {
        const path = await fledgeApi.skins.resolvePath(skinId)
        const asset = localFileAssetUrl(path)
        if (asset) {
          src = asset
          queryClient.setQueryData(['skin-path', skinId], path)
          queryClient.setQueryData(['skin-path-url', skinId], asset)
        } else {
          src = (await fledgeApi.skins.getDataUrl(skinId)) ?? undefined
          if (src) queryClient.setQueryData(['skin-data', skinId], src)
        }
      }
    } catch {
      return
    }
  }
  if (!src) return

  try {
    const [face32, face64] = await Promise.all([
      cropSkinFaceDataUrl(src, 32),
      cropSkinFaceDataUrl(src, 64),
    ])
    queryClient.setQueryData(['account-face', skinId, 32], face32)
    queryClient.setQueryData(['account-face', skinId, 64], face64)
  } catch {
    /* プレビュー用。失敗時は従来クエリに任せる */
  }
}

export function resolveSkinModel(
  skins: SkinEntry[],
  skinId: string,
  model?: SkinModel,
): SkinModel {
  if (model) return model
  return skins.find((s) => s.id === skinId)?.model ?? 'wide'
}
