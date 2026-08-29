const SCREENSHOT_NAME_RE = /^[^/\\]+\.(png|jpe?g|webp|gif)$/i

/** インスタンス screenshots/ 内の画像を表示するカスタムプロトコル URL */
export function instanceScreenshotUrl(instanceId: string, fileName: string): string {
  const id = encodeURIComponent(instanceId)
  const name = encodeURIComponent(fileName)
  return `fledge-screenshot://local/${id}/${name}`
}

export function isScreenshotFileName(name: string): boolean {
  return SCREENSHOT_NAME_RE.test(name) && !name.includes('..')
}
