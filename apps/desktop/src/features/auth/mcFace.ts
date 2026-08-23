export function mcFaceUrl(
  account: {
    avatarUrl?: string
    uuid: string
  } | null | undefined,
  pixelSize = 64,
): string | null {
  if (!account?.uuid) return null
  const size = Math.max(8, Math.round(pixelSize))
  return `https://mc-heads.net/avatar/${account.uuid.replaceAll('-', '')}/${size}`
}
