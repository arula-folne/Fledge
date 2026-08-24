import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web'

/** 進捗付きで URL を Buffer に落とす（小〜中サイズ向け） */
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

/**
 * URL をディスクへ直接ストリーム書き込みする。
 * 可能なら SHA1 もストリーム上で計算し、全文バッファを避ける。
 */
export async function fetchToFile(
  url: string,
  destPath: string,
  options: {
    signal: AbortSignal
    headers?: Record<string, string>
    expectedSha1?: string
    onProgress?: (current: number, total: number) => void
  },
): Promise<void> {
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
  const hash = options.expectedSha1 ? createHash('sha1') : null
  let current = 0

  await fs.mkdir(path.dirname(destPath), { recursive: true })
  const tmpPath = `${destPath}.part`
  await fs.rm(tmpPath, { force: true }).catch(() => undefined)

  const nodeBody = Readable.fromWeb(res.body as unknown as NodeWebReadableStream)
  nodeBody.on('data', (chunk: Buffer | string) => {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    current += buf.byteLength
    hash?.update(buf)
    options.onProgress?.(current, total || current)
  })

  try {
    await pipeline(nodeBody, createWriteStream(tmpPath))
  } catch (err) {
    await fs.rm(tmpPath, { force: true }).catch(() => undefined)
    throw err
  }

  if (options.expectedSha1 && hash) {
    const digest = hash.digest('hex')
    if (digest !== options.expectedSha1) {
      await fs.rm(tmpPath, { force: true }).catch(() => undefined)
      throw new Error('Checksum mismatch')
    }
  }

  await fs.rename(tmpPath, destPath)
}
