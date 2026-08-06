import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { PathLayout } from '../app/paths.js'
import type { Logger } from '../logging/Logger.js'
import type { DownloadQueue } from '../download/DownloadQueue.js'

const execFileAsync = promisify(execFile)

/** 管理対象の Java メジャー */
export const JAVA_MANAGED_MAJORS = [8, 17, 21, 25] as const
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
}

export type JavaVerifyResult = {
  ok: boolean
  major: JavaManagedMajor
  detail: string
  detectedMajor: number | null
}

/** Minecraft バージョンから必要 Java メジャーを推定 */
export function requiredJavaMajor(minecraftVersion: string): number {
  const m = /^(\d+)\.(\d+)/.exec(minecraftVersion)
  if (!m) return 21
  const major = Number(m[1])
  const minor = Number(m[2])
  if (major === 1 && minor <= 16) return 8
  if (major === 1 && minor <= 20) {
    if (minor < 20) return 17
    const patch = Number((/^\d+\.\d+\.(\d+)/.exec(minecraftVersion) ?? [])[1] ?? 0)
    return patch >= 5 ? 21 : 17
  }
  return 21
}

export class JavaManager {
  constructor(
    private readonly layout: PathLayout,
    private readonly queue: DownloadQueue,
    private readonly logger: Logger,
  ) {}

  installDir(major: number): string {
    // Data/java-version/java25 のようにメジャー名で並ぶ
    return path.join(this.layout.java, `java${major}`)
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
    const detected = await this.detectManagedJava(major)
    const displayPath = detected
      ? path.join(path.dirname(detected))
      : path.join(installDir, 'bin')
    return {
      major,
      installed: Boolean(detected),
      javaPath: detected,
      displayPath,
      installDir,
    }
  }

  async install(major: JavaManagedMajor, sessionId = `java-install-${major}`): Promise<JavaRuntimeView> {
    this.logger.info('java', `Installing Java ${major}…`)
    await this.downloadAndLink(major, sessionId, false)
    return this.getRuntimeView(major)
  }

  async reinstall(major: JavaManagedMajor, sessionId = `java-reinstall-${major}`): Promise<JavaRuntimeView> {
    this.logger.info('java', `Reinstalling Java ${major}…`)
    await this.downloadAndLink(major, sessionId, true)
    return this.getRuntimeView(major)
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

  async ensureJava(minecraftVersion: string, sessionId: string): Promise<string> {
    const needed = requiredJavaMajor(minecraftVersion)
    const major = this.toManagedMajor(needed)
    const detected = await this.detectManagedJava(major)
    if (detected) {
      this.logger.info('java', `Using Fledge-managed Java ${major}: ${detected}`)
      return detected
    }

    this.logger.info('java', `Fledge Java ${major} not found. Installing to default path…`)
    await this.downloadAndLink(major, sessionId, false)
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
    const higher = JAVA_MANAGED_MAJORS.find((m) => m >= major)
    return higher ?? JAVA_MANAGED_MAJORS[JAVA_MANAGED_MAJORS.length - 1]!
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
      labelKey: 'launch.phase.java',
      sessionId,
      execute: async (ctx) => {
        ctx.report({ current: 0, total: 1, unit: 'count' })
        if (force) {
          await fs.rm(this.installDir(major), { recursive: true, force: true })
        }
        const javaHome = await this.downloadTemurin(major, ctx.signal)
        await fs.mkdir(this.installDir(major), { recursive: true })
        await fs.writeFile(this.markerPath(major), javaHome, 'utf8')
        ctx.report({ current: 1, total: 1, unit: 'count' })
      },
    })
    await done
  }

  /** Fledge 管理下の Temurin のみ（新パス優先、旧 Data/Java/temurin-* も読取可） */
  private async detectManagedJava(major: number): Promise<string | null> {
    const candidates: string[] = [
      this.markerPath(major),
      this.legacyMarkerPath(major),
    ]
    for (const marker of candidates) {
      try {
        const stored = (await fs.readFile(marker, 'utf8')).trim()
        if (stored && (await this.isExactMajor(stored, major))) return stored
      } catch {
        /* continue */
      }
    }

    for (const dir of [this.installDir(major), this.legacyInstallDir(major)]) {
      try {
        const exe = await this.findJavaExe(dir)
        if (exe && (await this.isExactMajor(exe, major))) return exe
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

  private async downloadTemurin(major: number, signal: AbortSignal): Promise<string> {
    const api = `https://api.adoptium.net/v3/binary/latest/${major}/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk`
    const destZip = path.join(this.layout.temp, `temurin-${major}.zip`)
    const destDir = this.installDir(major)

    const res = await fetch(api, { signal, redirect: 'follow' })
    if (!res.ok || !res.body) {
      throw Object.assign(new Error('Failed to download Java'), { messageKey: 'download.error.network' })
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    await fs.mkdir(this.layout.temp, { recursive: true })
    await fs.writeFile(destZip, buffer)

    await fs.rm(destDir, { recursive: true, force: true })
    await fs.mkdir(destDir, { recursive: true })

    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${destZip}' -DestinationPath '${destDir}' -Force`],
      { windowsHide: true },
    )

    const javaExe = await this.findJavaExe(destDir)
    if (!javaExe) {
      throw Object.assign(new Error('java.exe not found after extract'), {
        messageKey: 'launch.error.generic',
      })
    }
    return javaExe
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
