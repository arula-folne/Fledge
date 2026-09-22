import fs from 'node:fs/promises'
import {
  buildOptionsFlgText,
  parseOptionsFlgText,
  type Settings,
} from '@fledge/shared'
import type { SettingsStore } from './SettingsStore.js'

/** 現在の設定を option.flg テキストへ */
export async function exportOptionsFlgText(store: SettingsStore): Promise<string> {
  const settings = await store.get()
  return buildOptionsFlgText(settings)
}

/** option.flg テキストを読み取り、設定へマージして保存 */
export async function importOptionsFlgText(
  store: SettingsStore,
  raw: string,
): Promise<Settings> {
  const partial = parseOptionsFlgText(raw)
  return store.set(partial)
}

/** パスへ書き出し */
export async function writeOptionsFlgFile(
  store: SettingsStore,
  filePath: string,
): Promise<void> {
  const text = await exportOptionsFlgText(store)
  await fs.writeFile(filePath, text, 'utf8')
}

/** パスから読み込み・適用 */
export async function readAndImportOptionsFlgFile(
  store: SettingsStore,
  filePath: string,
): Promise<Settings> {
  const raw = await fs.readFile(filePath, 'utf8')
  return importOptionsFlgText(store, raw)
}
