/**
 * textures.minecraft.net は http URL を返すことがある。WebGL / プロキシ用に https へ揃える。
 */
export function normalizeCapeTextureUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed
  if (trimmed.startsWith('http://')) {
    return `https://${trimmed.slice('http://'.length)}`
  }
  return trimmed
}
