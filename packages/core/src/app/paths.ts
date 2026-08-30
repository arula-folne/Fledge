import path from 'node:path'
import fs from 'node:fs/promises'
import type { PathInfo } from '@fledge/shared'

export type PathLayout = PathInfo

/**
 * PathLayout を組み立てる。
 *
 * - `root`（config）: instances / meta / caches 等（Modrinth 型のフラット構成）
 * - `settingsRoot`: 設定・アカウント（未指定時は root と同じ）
 */
export function resolvePathLayout(root: string, settingsRoot: string = root): PathLayout {
  return {
    root,
    data: root,
    settings: path.join(settingsRoot, 'Settings'),
    accounts: path.join(settingsRoot, 'Accounts'),
    cache: path.join(root, 'caches'),
    minecraft: path.join(root, 'meta'),
    java: path.join(root, 'java'),
    logs: path.join(root, 'logs'),
    news: path.join(root, 'news'),
    temp: path.join(root, 'temp'),
    skins: path.join(root, 'skins'),
    instances: path.join(root, 'instances'),
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
