import path from 'node:path'
import fs from 'node:fs/promises'
import type { PathInfo } from '@fledge/shared'

export type PathLayout = PathInfo

/**
 * Fledge の二層パス。
 *
 * - settingsRoot（%APPDATA%\\fledge）: Settings / Accounts / logs / news
 * - root（既定: installDir/data、設定で変更可）: instances / meta / caches / skins / temp
 *
 * フォルダ名は Fledge 独自（instances 等）。他ランチャーの商標・製品固有名は使わない。
 */
export function resolvePathLayout(root: string, settingsRoot: string = root): PathLayout {
  return {
    root,
    data: root,
    settings: path.join(settingsRoot, 'Settings'),
    accounts: path.join(settingsRoot, 'Accounts'),
    cache: path.join(root, 'caches'),
    minecraft: path.join(root, 'meta'),
    java: path.join(root, 'meta', 'java'),
    logs: path.join(settingsRoot, 'logs'),
    news: path.join(settingsRoot, 'news'),
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
