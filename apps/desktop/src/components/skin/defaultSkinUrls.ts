import steveThumb from '../../assets/skins/thumbs/steve.png'
import alexThumb from '../../assets/skins/thumbs/alex.png'
import ariThumb from '../../assets/skins/thumbs/ari.png'
import efeThumb from '../../assets/skins/thumbs/efe.png'
import kaiThumb from '../../assets/skins/thumbs/kai.png'
import makenaThumb from '../../assets/skins/thumbs/makena.png'
import noorThumb from '../../assets/skins/thumbs/noor.png'
import sunnyThumb from '../../assets/skins/thumbs/sunny.png'
import zuriThumb from '../../assets/skins/thumbs/zuri.png'

import steveTexture from '../../assets/skins/textures/steve.png'
import alexTexture from '../../assets/skins/textures/alex.png'
import ariTexture from '../../assets/skins/textures/ari.png'
import efeTexture from '../../assets/skins/textures/efe.png'
import kaiTexture from '../../assets/skins/textures/kai.png'
import makenaTexture from '../../assets/skins/textures/makena.png'
import noorTexture from '../../assets/skins/textures/noor.png'
import sunnyTexture from '../../assets/skins/textures/sunny.png'
import zuriTexture from '../../assets/skins/textures/zuri.png'

const DEFAULT_SKIN_THUMBS: Record<string, string> = {
  steve: steveThumb,
  alex: alexThumb,
  ari: ariThumb,
  efe: efeThumb,
  kai: kaiThumb,
  makena: makenaThumb,
  noor: noorThumb,
  sunny: sunnyThumb,
  zuri: zuriThumb,
}

/** 3D プレビュー用の同梱スキン PNG（Minecraft テクスチャ）。製品版でも IPC 無しで読める */
const DEFAULT_SKIN_TEXTURES: Record<string, string> = {
  steve: steveTexture,
  alex: alexTexture,
  ari: ariTexture,
  efe: efeTexture,
  kai: kaiTexture,
  makena: makenaTexture,
  noor: noorTexture,
  sunny: sunnyTexture,
  zuri: zuriTexture,
}

/** カード一覧用の同梱サムネ（Vite アセット） */
export function defaultSkinThumbUrl(id: string): string | undefined {
  return DEFAULT_SKIN_THUMBS[id]
}

/** 3D プレビュー用の同梱テクスチャ URL */
export function defaultSkinTextureUrl(id: string): string | undefined {
  return DEFAULT_SKIN_TEXTURES[id]
}
