import steveThumb from '../../assets/skins/thumbs/steve.png'
import alexThumb from '../../assets/skins/thumbs/alex.png'
import ariThumb from '../../assets/skins/thumbs/ari.png'
import efeThumb from '../../assets/skins/thumbs/efe.png'
import kaiThumb from '../../assets/skins/thumbs/kai.png'
import makenaThumb from '../../assets/skins/thumbs/makena.png'
import noorThumb from '../../assets/skins/thumbs/noor.png'
import sunnyThumb from '../../assets/skins/thumbs/sunny.png'
import zuriThumb from '../../assets/skins/thumbs/zuri.png'

const DEFAULT_SKIN_IDS = new Set([
  'steve',
  'alex',
  'ari',
  'efe',
  'kai',
  'makena',
  'noor',
  'sunny',
  'zuri',
])

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

/** 3D プレビュー用。実テクスチャは extraResources のスキンを protocol 経由で読む */
export function defaultSkinUrl(id: string): string | undefined {
  if (!DEFAULT_SKIN_IDS.has(id)) return undefined
  return `fledge-skin://local/${id}.png`
}

export function defaultSkinThumbUrl(id: string): string | undefined {
  return DEFAULT_SKIN_THUMBS[id]
}
