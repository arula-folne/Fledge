import { unzipSync } from 'fflate'

/** ZIP バッファをパス → バイトに展開する（mrpack 用） */
export function unzipToEntries(buf: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(buf)
}
