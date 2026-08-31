import type { QueryClient } from '@tanstack/react-query'
import type { Settings, SkinEntry, SkinModel } from '@fledge/shared'
import { defaultSkinUrl } from '../../components/skin/defaultSkinUrls'
import { cropSkinFaceDataUrl } from '../auth/skinFace'

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
  const skin = skins.find((s) => s.id === skinId)
  let dataUrl = queryClient.getQueryData<string>(['skin-data', skinId]) ?? undefined
  if (!dataUrl && skin?.source === 'default') {
    dataUrl = defaultSkinUrl(skinId)
  }
  if (!dataUrl) return

  try {
    const [face32, face64] = await Promise.all([
      cropSkinFaceDataUrl(dataUrl, 32),
      cropSkinFaceDataUrl(dataUrl, 64),
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
