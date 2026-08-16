/** 進捗付きで URL を Buffer に落とす */
export async function fetchBody(
  url: string,
  options: {
    signal: AbortSignal
    headers?: Record<string, string>
    onProgress?: (current: number, total: number) => void
  },
): Promise<Buffer> {
  const res = await fetch(url, {
    signal: options.signal,
    redirect: 'follow',
    headers: options.headers,
  })
  if (!res.ok || !res.body) {
    throw Object.assign(new Error(`Download failed: HTTP ${res.status}`), {
      messageKey: 'download.error.network',
    })
  }

  const total = Number(res.headers.get('content-length') ?? 0)
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let current = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    current += value.byteLength
    options.onProgress?.(current, total || current)
  }

  return Buffer.concat(chunks)
}
