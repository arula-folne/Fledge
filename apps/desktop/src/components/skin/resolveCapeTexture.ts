import { fledgeApi } from '../../api/fledgeApi'
import { normalizeCapeTextureUrl } from './normalizeCapeUrl'

const cache = new Map<string, Promise<string>>()

function bytesToDataUrl(bytes: Uint8Array, mime = 'image/png'): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

/**
 * skinview3d（WebGL）用にマント PNG を data URL にする。
 * 1) Rust IPC  2) ブラウザ fetch  の順で試し、失敗時は例外。
 */
export function resolveCapeTextureSource(url: string): Promise<string> {
  const key = normalizeCapeTextureUrl(url)
  if (!key) return Promise.reject(new Error('empty cape url'))
  if (key.startsWith('data:') || key.startsWith('blob:')) return Promise.resolve(key)

  const hit = cache.get(key)
  if (hit) return hit

  const pending = (async () => {
    try {
      const viaRust = await fledgeApi.capes.fetchTexture(key)
      if (typeof viaRust === 'string' && viaRust.startsWith('data:')) return viaRust
    } catch {
      /* fall through */
    }

    const res = await fetch(key, { mode: 'cors', credentials: 'omit', cache: 'force-cache' })
    if (!res.ok) throw new Error(`cape texture http ${res.status}`)
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.length < 64) throw new Error('cape texture too small')
    return bytesToDataUrl(buf, res.headers.get('content-type') || 'image/png')
  })()
    .then((dataUrl) => {
      cache.set(key, Promise.resolve(dataUrl))
      return dataUrl
    })
    .catch((err) => {
      cache.delete(key)
      throw err
    })

  cache.set(key, pending)
  return pending
}
