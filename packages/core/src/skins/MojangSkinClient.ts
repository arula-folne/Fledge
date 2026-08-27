import { createHash } from 'node:crypto'
import { fledgeUserAgent } from '@fledge/shared'
import { File } from 'node:buffer'
import type { SkinModel } from '@fledge/shared'

const SKIN_UPLOAD_URL = 'https://api.minecraftservices.com/minecraft/profile/skins'
const PROFILE_URL = 'https://api.minecraftservices.com/minecraft/profile'

type ProfileSkin = {
  id?: string
  state?: string
  url?: string
  variant?: string
}

/**
 * 公式プロフィールのアクティブスキン（PNG + モデル）を取得する。
 * 取得できない場合は null（カスタム未設定・ネットワーク失敗など）。
 */
export async function fetchActiveMinecraftSkin(accessToken: string): Promise<{
  png: Uint8Array
  model: SkinModel
  textureUrl: string
} | null> {
  const profileRes = await fetch(PROFILE_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': fledgeUserAgent('skin-profile'),
    },
  })
  if (!profileRes.ok) return null

  const json = (await profileRes.json()) as { skins?: ProfileSkin[] }
  const active = json.skins?.find((s) => s.state === 'ACTIVE' && s.url)
  if (!active?.url) return null

  const texRes = await fetch(active.url, {
    headers: { 'User-Agent': fledgeUserAgent('skin-texture') },
  })
  if (!texRes.ok) return null
  const buf = new Uint8Array(await texRes.arrayBuffer())
  if (buf.byteLength < 64) return null

  const variant = (active.variant ?? 'CLASSIC').toUpperCase()
  const model: SkinModel = variant === 'SLIM' ? 'slim' : 'wide'
  return { png: buf, model, textureUrl: active.url }
}

export function hashSkinPng(png: Uint8Array): string {
  return createHash('sha256').update(png).digest('hex')
}

/**
 * 公式プロフィールへスキンをアップロードする。
 *
 * プロフィール上は即時更新されるが、起動中の Minecraft クライアントは
 * 自分の見た目をセッション中キャッシュするため、入り直しだけでは変わらないことがある。
 *
 * @returns 公式プロフィール上のアクティブスキン URL（取得できた場合）
 */
export async function uploadMinecraftSkin(
  accessToken: string,
  png: Uint8Array,
  variant: 'classic' | 'slim',
): Promise<{ skinUrl?: string }> {
  const bytes = png instanceof Uint8Array ? png : new Uint8Array(png)
  const form = new FormData()
  form.append('variant', variant)
  form.append('file', new File([bytes], 'skin.png', { type: 'image/png' }))

  const res = await fetch(SKIN_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': fledgeUserAgent('skin-upload'),
    },
    body: form,
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    if (res.status === 401 || res.status === 403) {
      throw new Error('スキンの適用に失敗しました。再ログインしてからやり直してください。')
    }
    if (res.status === 429) {
      throw new Error('スキン変更の回数制限に達しました。しばらく待ってからやり直してください。')
    }
    throw new Error(
      detail
        ? `スキンの適用に失敗しました (${res.status}): ${detail.slice(0, 180)}`
        : `スキンの適用に失敗しました (${res.status})`,
    )
  }

  // プロフィール反映確認（失敗してもアップロード自体は成功扱い）
  try {
    const profileRes = await fetch(PROFILE_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'User-Agent': fledgeUserAgent('skin-verify'),
      },
    })
    if (profileRes.ok) {
      const json = (await profileRes.json()) as {
        skins?: Array<{ id?: string; state?: string; url?: string }>
      }
      const active = json.skins?.find((s) => s.state === 'ACTIVE')
      if (active?.url) return { skinUrl: active.url }
    }
  } catch {
    /* ignore verify errors */
  }
  return {}
}
