import path from 'node:path'
import fs from 'node:fs/promises'
import type { PathInfo } from '@fledge/shared'

export type PathLayout = PathInfo

/** インストール先（または開発用ルート）から PathLayout を組み立てる */
export function resolvePathLayout(root: string): PathLayout {
  const data = path.join(root, 'Data')
  return {
    root,
    data,
    settings: path.join(data, 'Settings'),
    accounts: path.join(data, 'Accounts'),
    cache: path.join(data, 'Cache'),
    minecraft: path.join(data, 'Minecraft'),
    java: path.join(data, 'java-version'),
    logs: path.join(data, 'Logs'),
    news: path.join(data, 'News'),
    temp: path.join(data, 'Temp'),
    skins: path.join(data, 'Skins'),
    instances: path.join(root, 'Instances'),
  }
}

export async function ensurePathLayout(layout: PathLayout): Promise<void> {
  const dirs = [
    layout.data,
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
