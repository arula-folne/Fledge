import steveUrl from '../../assets/skins/steve.png'
import alexUrl from '../../assets/skins/alex.png'
import ariUrl from '../../assets/skins/ari.png'
import efeUrl from '../../assets/skins/efe.png'
import kaiUrl from '../../assets/skins/kai.png'
import makenaUrl from '../../assets/skins/makena.png'
import noorUrl from '../../assets/skins/noor.png'
import sunnyUrl from '../../assets/skins/sunny.png'
import zuriUrl from '../../assets/skins/zuri.png'

const DEFAULT_SKIN_URLS: Record<string, string> = {
  steve: steveUrl,
  alex: alexUrl,
  ari: ariUrl,
  efe: efeUrl,
  kai: kaiUrl,
  makena: makenaUrl,
  noor: noorUrl,
  sunny: sunnyUrl,
  zuri: zuriUrl,
}

export function defaultSkinUrl(id: string): string | undefined {
  return DEFAULT_SKIN_URLS[id]
}
