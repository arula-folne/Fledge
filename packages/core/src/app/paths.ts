import path from 'node:path'
import fs from 'node:fs/promises'
import type { PathInfo } from '@fledge/shared'

export type PathLayout = PathInfo

/**
 * PathLayout を組み立てる（Modrinth App と同じ二層）。
 *
 * - `settingsRoot`（AppData）: 設定・アカウント・ランチャーログ・お知らせキャッシュ
 * - `root`（config / データディレクトリ・変更可）: profiles / meta / caches 等
 */
export function resolvePathLayout(root: string, settingsRoot: string = root): PathLayout {
  return {
    root,
    data: root,
    settings: path.join(settingsRoot, 'Settings'),
    accounts: path.join(settingsRoot, 'Accounts'),
    cache: path.join(root, 'caches'),
    minecraft: path.join(root, 'meta'),
    java: path.join(root, 'meta', 'java_versions'),
    logs: path.join(settingsRoot, 'launcher_logs'),
    news: path.join(settingsRoot, 'news'),
    temp: path.join(root, 'temp'),
    skins: path.join(root, 'skins'),
    instances: path.join(root, 'profiles'),
  }
}

export async function ensurePathLayout(layout: PathLayout): Promise<void> {
  const dirs = [
    layout.settings,
    layout.accounts,
    layout.cache,
    layout.minecraft,
    path.join(layout.minecraft, 'assets'),
    path.join(layout.minecraft, 'libraries'),
    path.join(layout.minecraft, 'versions'),
    layout.java,
    layout.logs,
    layout.news,
    layout.temp,
    layout.skins,
    layout.instances,
  ]
  await Promise.all(dirs.map((dir) => fs.mkdir(dir, { recursive: true })))
}
