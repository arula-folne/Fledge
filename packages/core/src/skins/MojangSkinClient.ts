const SKIN_UPLOAD_URL = 'https://api.minecraftservices.com/minecraft/profile/skins'
const USER_AGENT = 'Fledge/0.1'

/**
 * 公式プロフィールへスキンをアップロードする。
 * ゲームを再起動しなくても、ワールド／サーバー再入場で反映される。
 */
export async function uploadMinecraftSkin(
  accessToken: string,
  png: Uint8Array,
  variant: 'classic' | 'slim',
): Promise<void> {
  const form = new FormData()
  form.append('variant', variant)
  form.append('file', new Blob([Buffer.from(png)], { type: 'image/png' }), 'skin.png')

  const res = await fetch(SKIN_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: form,
  })

  if (res.ok) return

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
