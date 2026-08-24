import { fledgeUserAgent } from '@fledge/shared'
import { File } from 'node:buffer'

const SKIN_UPLOAD_URL = 'https://api.minecraftservices.com/minecraft/profile/skins'
const PROFILE_URL = 'https://api.minecraftservices.com/minecraft/profile'

/**
 * 公式プロフィールへスキンをアップロードする。
 *
 * プロフィール上は即時更新されるが、起動中の Minecraft クライアントは
 * 自分の見た目をセッション中キャッシュするため、入り直しだけでは変わらないことがある。
 */
export async function uploadMinecraftSkin(
  accessToken: string,
  png: Uint8Array,
  variant: 'classic' | 'slim',
): Promise<void> {
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

  // CDN / プロフィール反映の確認（失敗してもアップロード自体は成功扱い）
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
      if (!active?.url) {
        // プロフィールにアクティブスキンが見えない場合でも POST は成功している
      }
    }
  } catch {
    /* ignore verify errors */
  }
}
