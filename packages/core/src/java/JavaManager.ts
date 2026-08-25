import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { PathLayout } from '../app/paths.js'
import type { Logger } from '../logging/Logger.js'
import type { DownloadQueue } from '../download/DownloadQueue.js'
import { fetchToFile } from '../download/fetchBody.js'

const execFileAsync = promisify(execFile)

/** 管理対象の Java メジャー */
export const JAVA_MANAGED_MAJORS = [25, 21, 17, 8] as const
export type JavaManagedMajor = (typeof JAVA_MANAGED_MAJORS)[number]

export type JavaRuntimeView = {
  major: JavaManagedMajor
  installed: boolean
  /** java.exe のフルパス（未インストール時 null） */
  javaPath: string | null
  /** UI 表示用（…/java-version/java25/…/bin など） */
  displayPath: string
  /** 展開ディレクトリ */
  installDir: string
  /** インストール済み、または消し残しがある */
  removable: boolean
}

export type JavaVerifyResult = {
  ok: boolean
  major: JavaManagedMajor
  detail: string
  detectedMajor: number | null
}

/**
 * Minecraft バージョンから必要 Java メジャーを推定。
 * 26.x 以降は年号バージョン（java-runtime-epsilon = 25）。
 */
export function requiredJavaMajor(minecraftVersion: string): number {
  const m = /^(\d+)\.(\d+)/.exec(minecraftVersion)
  if (!m) return 21
  const major = Number(m[1])
  const minor = Number(m[2])
  if (major >= 26) return 25
  if (major !== 1) return 21
  if (minor <= 16) return 8
  if (minor < 20) return 17
  if (minor === 20) {
    const patch = Number((/^\d+\.\d+\.(\d+)/.exec(minecraftVersion) ?? [])[1] ?? 0)
    return patch >= 5 ? 21 : 17
  }
  return 21
}

export class JavaManager {
  private readonly inflight = new Map<JavaManagedMajor, Promise<JavaRuntimeView>>()
  private readonly pathMemo = new Map<number, string>()

  constructor(
    private readonly layout: PathLayout,
    private readonly queue: DownloadQueue,
    private readonly logger: Logger,
  ) {}

  installDir(major: number): string {
    // Data/java-version/java25 のようにメジャー名で並ぶ
    return path.join(this.layout.java, `java${major}`)
  }

  clearMemo(): void {
    this.pathMemo.clear()
  }

  private markerPath(major: number): string {
    return path.join(this.installDir(major), '.fledge-java')
  }

  private legacyInstallDir(major: number): string {
    return path.join(this.layout.data, 'Java', `temurin-${major}`)
  }

  private legacyMarkerPath(major: number): string {
    return path.join(this.layout.data, 'Java', `java-${major}.path`)
  }

  async listRuntimes(): Promise<JavaRuntimeView[]> {
    await fs.mkdir(this.layout.java, { recursive: true })
    const views: JavaRuntimeView[] = []
    for (const major of JAVA_MANAGED_MAJORS) {
      views.push(await this.getRuntimeView(major))
    }
    return views
  }

  async getRuntimeView(major: JavaManagedMajor): Promise<JavaRuntimeView> {
    const installDir = this.installDir(major)
    await this.maybeFlattenExisting(major)
    const detected = await this.detectManagedJava(major)
    const leftover =
      (await this.pathExists(installDir)) ||
      (await this.pathExists(this.legacyInstallDir(major))) ||
      (await this.pathExists(this.legacyMarkerPath(major)))
    const displayPath = detected ? path.dirname(detected) : installDir
    return {
      major,
      installed: Boolean(detected),
      javaPath: detected,
      displayPath,
      installDir,
      removable: Boolean(detected) || leftover,
    }
  }

  async install(major: JavaManagedMajor, sessionId = `java-install-${major}`): Promise<JavaRuntimeView> {
    this.logger.info('java', `Installing Java ${major}…`)
    return this.runExclusive(major, () => this.downloadAndLink(major, sessionId, false))
  }

  async reinstall(major: JavaManagedMajor, sessionId = `java-reinstall-${major}`): Promise<JavaRuntimeView> {
    this.logger.info('java', `Reinstalling Java ${major}…`)
    return this.runExclusive(major, () => this.downloadAndLink(major, sessionId, true))
  }

  async uninstall(major: JavaManagedMajor): Promise<JavaRuntimeView> {
    if (this.inflight.has(major)) {
      throw Object.assign(new Error('Java is busy'), { messageKey: 'settings.java.busy' })
    }
    this.logger.info('java', `Uninstalling Java ${major}…`)
    return this.runExclusive(major, () => this.removeManaged(major))
  }

  private async removeManaged(major: JavaManagedMajor): Promise<void> {
    this.pathMemo.delete(major)
    const targets = [
      this.installDir(major),
      this.legacyInstallDir(major),
      this.legacyMarkerPath(major),
      path.join(this.layout.temp, `temurin-${major}.zip`),
    ]
    for (const target of targets) {
      await fs.rm(target, { recursive: true, force: true })
    }
  }

  private runExclusive(
    major: JavaManagedMajor,
    work: () => Promise<void>,
  ): Promise<JavaRuntimeView> {
    const existing = this.inflight.get(major)
    if (existing) return existing
    const next = work()
      .then(() => this.getRuntimeView(major))
      .finally(() => {
        this.inflight.delete(major)
      })
    this.inflight.set(major, next)
    return next
  }

  async verify(major: JavaManagedMajor): Promise<JavaVerifyResult> {
    const javaPath = await this.detectManagedJava(major)
    if (!javaPath) {
      return {
        ok: false,
        major,
        detail: 'not_installed',
        detectedMajor: null,
      }
    }
    try {
      await fs.access(javaPath)
      const { stderr, stdout } = await execFileAsync(javaPath, ['-version'], { windowsHide: true })
      const output = `${stdout}\n${stderr}`
      const detectedMajor = this.parseMajor(output)
      if (detectedMajor === major) {
        return { ok: true, major, detail: 'ok', detectedMajor }
      }
      return {
        ok: false,
        major,
        detail: 'version_mismatch',
        detectedMajor,
      }
    } catch {
      return {
        ok: false,
        major,
        detail: 'exec_failed',
        detectedMajor: null,
      }
    }
  }

  /** 導入済み version JSON の javaVersion を優先し、なければ推定 */
  private async resolveRequiredMajor(minecraftVersion: string): Promise<number> {
    try {
      const jsonPath = path.join(
        this.layout.minecraft,
        'versions',
        minecraftVersion,
        `${minecraftVersion}.json`,
      )
      const raw = await fs.readFile(jsonPath, 'utf8')
      const parsed = JSON.parse(raw) as { javaVersion?: { majorVersion?: number } }
      const fromJson = parsed.javaVersion?.majorVersion
      if (typeof fromJson === 'number' && fromJson >= 8) return fromJson
    } catch {
      /* 未導入なら推定 */
    }
    return requiredJavaMajor(minecraftVersion)
  }

  async ensureJava(minecraftVersion: string, sessionId: string): Promise<string> {
    const needed = await this.resolveRequiredMajor(minecraftVersion)
    const major = this.toManagedMajor(needed)
    const detected = await this.detectManagedJava(major)
    if (detected) {
      this.logger.info('java', `Using Fledge-managed Java ${major}: ${detected}`)
      return detected
    }

    this.logger.info('java', `Fledge Java ${major} not found. Installing to default path…`)
    await this.runExclusive(major, () => this.downloadAndLink(major, sessionId, false))
    const installed = await this.detectManagedJava(major)
    if (!installed) {
      throw Object.assign(new Error('Java install failed'), { messageKey: 'launch.error.generic' })
    }
    return installed
  }

  /** 起動・作成ではアプリ管理下の Java のみ（PATH / Program Files は使わない） */
  private toManagedMajor(major: number): JavaManagedMajor {
    if ((JAVA_MANAGED_MAJORS as readonly number[]).includes(major)) {
      return major as JavaManagedMajor
    }
    const ascending = [...JAVA_MANAGED_MAJORS].sort((a, b) => a - b)
    const higher = ascending.find((m) => m >= major)
    return higher ?? ascending[ascending.length - 1]!
  }

  private async downloadAndLink(
    major: JavaManagedMajor,
    sessionId: string,
    force: boolean,
  ): Promise<void> {
    if (!force) {
      const existing = await this.detectManagedJava(major)
      if (existing) return
    }

    const { done } = this.queue.enqueue({
      kind: 'java',
      labelKey: force ? 'transfer.javaReinstall' : 'transfer.java',
      sessionId,
      meta: { major, action: force ? 'reinstall' : 'install' },
      execute: async (ctx) => {
        ctx.report({
          current: 0,
          total: 1,
          unit: 'bytes',
          messageKey: 'settings.java.downloading',
        })
        if (force) {
          this.pathMemo.delete(major)
          await fs.rm(this.installDir(major), { recursive: true, force: true })
        }
        const javaHome = await this.downloadTemurin(
          major,
          ctx.signal,
          (current, total) => {
            ctx.report({
              current,
              total,
              unit: 'bytes',
              messageKey: 'settings.java.downloading',
            })
          },
          () => {
            ctx.report({
              current: 1,
              total: 1,
              unit: 'count',
              messageKey: 'settings.java.extracting',
            })
          },
        )
        await fs.mkdir(this.installDir(major), { recursive: true })
        await fs.writeFile(this.markerPath(major), javaHome, 'utf8')
        this.pathMemo.set(major, javaHome)
        ctx.report({ current: 1, total: 1, unit: 'count', messageKey: 'settings.java.downloading' })
      },
    })
    await done
  }

  /** Fledge 管理下の Temurin のみ（新パス優先、旧 Data/Java/temurin-* も読取可） */
  private async detectManagedJava(major: number): Promise<string | null> {
    const memo = this.pathMemo.get(major)
    if (memo) {
      try {
        await fs.access(memo)
        return memo
      } catch {
        this.pathMemo.delete(major)
      }
    }

    const candidates: string[] = [
      this.markerPath(major),
      this.legacyMarkerPath(major),
    ]
    for (const marker of candidates) {
      try {
        const stored = (await fs.readFile(marker, 'utf8')).trim()
        if (!stored) continue
        await fs.access(stored)
        this.pathMemo.set(major, stored)
        return stored
      } catch {
        /* continue */
      }
    }

    for (const dir of [this.installDir(major), this.legacyInstallDir(major)]) {
      try {
        const exe = await this.findJavaExe(dir)
        if (exe && (await this.isExactMajor(exe, major))) {
          this.pathMemo.set(major, exe)
          return exe
        }
      } catch {
        /* continue */
      }
    }
    return null
  }

  private async isExactMajor(javaPath: string, major: number): Promise<boolean> {
    try {
      await fs.access(javaPath)
      const { stderr, stdout } = await execFileAsync(javaPath, ['-version'], { windowsHide: true })
      return this.parseMajor(`${stdout}\n${stderr}`) === major
    } catch {
      return false
    }
  }

  private parseMajor(versionOutput: string): number | null {
    const m = /version\s+"?(?:1\.)?(\d+)/i.exec(versionOutput)
    if (!m?.[1]) return null
    return Number(m[1])
  }

  private async downloadTemurin(
    major: number,
    signal: AbortSignal,
    onProgress?: (current: number, total: number) => void,
    onExtracting?: () => void,
  ): Promise<string> {
    const api = `https://api.adoptium.net/v3/binary/latest/${major}/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk`
    const destZip = path.join(this.layout.temp, `temurin-${major}.zip`)
    const destDir = this.installDir(major)

    await fs.mkdir(this.layout.temp, { recursive: true })
    await fetchToFile(api, destZip, { signal, onProgress })

    onExtracting?.()
    await fs.rm(destDir, { recursive: true, force: true })
    await fs.mkdir(destDir, { recursive: true })

    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${destZip}' -DestinationPath '${destDir}' -Force`],
      { windowsHide: true },
    )

    const versionLabel = await this.flattenJdkLayout(destDir)
    const javaExe = path.join(destDir, 'bin', 'java.exe')
    const resolved = (await this.pathExists(javaExe)) ? javaExe : await this.findJavaExe(destDir)
    if (!resolved) {
      throw Object.assign(new Error('java.exe not found after extract'), {
        messageKey: 'launch.error.generic',
      })
    }
    const version =
      versionLabel ??
      (await this.readJdkReleaseVersion(destDir)) ??
      path.basename(path.dirname(resolved))
    await this.writeVersionDoc(destDir, version, major)
    return resolved
  }

  private async pathExists(target: string): Promise<boolean> {
    try {
      await fs.access(target)
      return true
    } catch {
      return false
    }
  }

  /**
   * Adoptium zip は jdk-21.0.12+8 のような一段深いフォルダになる。
   * Data/java-version/java21/bin になるよう中身を上げる。
   * @returns 分かれば JDK のバージョンラベル（例: 21.0.12+8）
   */
  private async flattenJdkLayout(destDir: string): Promise<string | null> {
    const flatJava = path.join(destDir, 'bin', 'java.exe')
    if (await this.pathExists(flatJava)) {
      return this.readJdkReleaseVersion(destDir)
    }

    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(destDir, { withFileTypes: true })
    } catch {
      return null
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const nested = path.join(destDir, entry.name)
      if (!(await this.pathExists(path.join(nested, 'bin', 'java.exe')))) continue

      const nestedNames = await fs.readdir(nested)
      for (const name of nestedNames) {
        await fs.rename(path.join(nested, name), path.join(destDir, name))
      }
      await fs.rm(nested, { recursive: true, force: true })
      return entry.name.replace(/^jdk-/i, '')
    }
    return null
  }

  private async maybeFlattenExisting(major: number): Promise<void> {
    const destDir = this.installDir(major)
    if (!(await this.pathExists(destDir))) return
    const flatJava = path.join(destDir, 'bin', 'java.exe')
    try {
      if (await this.pathExists(flatJava)) {
        if (!(await this.hasVersionDoc(destDir))) {
          const version = (await this.readJdkReleaseVersion(destDir)) ?? String(major)
          await this.writeVersionDoc(destDir, version, major)
        }
        return
      }

      const versionLabel = await this.flattenJdkLayout(destDir)
      const resolved = (await this.pathExists(flatJava)) ? flatJava : await this.findJavaExe(destDir)
      if (!resolved) return
      await fs.writeFile(this.markerPath(major), resolved, 'utf8')
      this.pathMemo.set(major, resolved)
      if (!(await this.hasVersionDoc(destDir))) {
        const version =
          versionLabel ?? (await this.readJdkReleaseVersion(destDir)) ?? String(major)
        await this.writeVersionDoc(destDir, version, major)
      }
    } catch {
      // 使用中などで移動できない場合は入れ子のまま検出する
    }
  }

  private async hasVersionDoc(installDir: string): Promise<boolean> {
    try {
      const names = await fs.readdir(installDir)
      return names.some((name) => /^jdk-.*\.md$/i.test(name))
    } catch {
      return false
    }
  }

  private async readJdkReleaseVersion(javaHome: string): Promise<string | null> {
    try {
      const raw = await fs.readFile(path.join(javaHome, 'release'), 'utf8')
      const semantic = /SEMANTIC_VERSION="([^"]+)"/.exec(raw)
      if (semantic?.[1]) return semantic[1]
      const javaVersion = /JAVA_VERSION="([^"]+)"/.exec(raw)
      if (javaVersion?.[1]) return javaVersion[1]
    } catch {
      /* ignore */
    }
    return null
  }

  private async writeVersionDoc(
    installDir: string,
    version: string,
    major: number,
  ): Promise<void> {
    const label = version.replace(/^jdk-/i, '')
    const fileName = `jdk-${label}.md`
    const body = [
      `# Eclipse Temurin JDK ${label}`,
      '',
      'Fledge が導入した Java ランタイムです。',
      '',
      `- Major: ${major}`,
      `- Version: ${label}`,
      `- Layout: \`java${major}/bin\``,
      '',
    ].join('\n')

    try {
      const names = await fs.readdir(installDir)
      for (const name of names) {
        if (/^jdk-.*\.md$/i.test(name) && name !== fileName) {
          await fs.rm(path.join(installDir, name), { force: true })
        }
      }
    } catch {
      /* ignore */
    }
    await fs.writeFile(path.join(installDir, fileName), body, 'utf8')
  }

  private async findJavaExe(root: string): Promise<string | null> {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(root, { withFileTypes: true })
    } catch {
      return null
    }
    for (const entry of entries) {
      const full = path.join(root, entry.name)
      if (entry.isDirectory()) {
        const nested = await this.findJavaExe(full)
        if (nested) return nested
      } else if (entry.name.toLowerCase() === 'java.exe') {
        return full
      }
    }
    return null
  }
}
