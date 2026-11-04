/**
 * @xmcl パッケージの types フィールドが不完全な場合のフォールバック。
 * 実行時は dist の実装を使用する。
 */
declare module '@xmcl/installer' {
  export function getVersionList(): Promise<{
    versions: Array<{ id: string; type: string; releaseTime: string; url: string }>
  }>
  export function installMinecraft(
    versionMeta: { id: string; type: string; url: string },
    minecraft: string,
    options?: unknown,
  ): Promise<unknown>
  export function completeInstallation(version: unknown, options?: unknown): Promise<void>
  export function installMinecraftJar(version: unknown, options?: unknown): Promise<void>
  export function installResolvedLibraries(
    libraries: unknown[],
    minecraft: string | unknown,
    options?: unknown,
  ): Promise<void>
  export function installResolvedAssets(
    assets: Array<{ name: string; hash: string; size: number }>,
    folder: unknown,
    version: string,
    options?: unknown,
  ): Promise<void>
  export function diagnoseProfile(
    installProfile: unknown,
    minecraftLocation: unknown,
    side?: 'client' | 'server',
  ): Promise<boolean>
  export function installByProfile(
    installProfile: unknown,
    minecraft: unknown,
    options?: unknown,
  ): Promise<void>
  export const DEFAULT_RESOURCE_ROOT_URL: string
  export type InstallProfile = Record<string, unknown>

  export function getFabricGames(options?: unknown): Promise<string[]>
  export function getFabricLoaders(options?: unknown): Promise<
    Array<{ version: string; stable: boolean; maven: string }>
  >
  export function getLoaderArtifactListFor(
    minecraft: string,
    options?: unknown,
  ): Promise<
    Array<{
      loader: { version: string; stable: boolean; maven: string }
    }>
  >
  export function installFabric(options: {
    minecraftVersion: string
    version: string
    minecraft: string
    side?: 'client' | 'server'
  }): Promise<string>

  export function getQuiltLoaderVersionsByMinecraft(options: {
    minecraftVersion: string
  }): Promise<
    Array<{
      loader: { version: string; stable: boolean; maven: string }
    }>
  >
  export function installQuiltVersion(options: {
    minecraftVersion: string
    version: string
    minecraft: string
    side?: 'client' | 'server'
  }): Promise<string>

  export function getForgeVersionList(options?: {
    minecraft?: string
  }): Promise<{
    mcversion: string
    versions: Array<{
      version: string
      mcversion: string
      type: string
      installer: { path: string; sha1?: string; md5?: string }
    }>
  }>
  export function installForge(
    version: { version: string; mcversion: string },
    minecraft: string,
    options?: unknown,
  ): Promise<string>

  export function installNeoForge(
    project: 'forge' | 'neoforge',
    version: string,
    minecraft: string,
    options?: unknown,
  ): Promise<string>
}

declare module '@xmcl/core' {
  export class MinecraftFolder {
    readonly root: string
    static from(location: MinecraftFolder | string): MinecraftFolder
    constructor(root: string)
    getLibraryByPath(libraryPath: string): string
    getVersionRoot(version: string): string
    getLogConfig(file: string): string
    getPath(...path: string[]): string
    getAsset(hash: string): string
  }

  export function checksum(target: string, algorithm: string): Promise<string>

  export const Version: {
    parse(minecraft: string, version: string): Promise<unknown>
  }

  export type LaunchPrecheck = (
    resource: unknown,
    version: unknown,
    option: Record<string, unknown>,
  ) => Promise<void>

  export const LaunchPrecheck: {
    checkVersion: LaunchPrecheck
    checkLibraries: LaunchPrecheck
    checkNatives: LaunchPrecheck
    linkAssets: LaunchPrecheck
    DEFAULT_PRECHECKS: readonly LaunchPrecheck[]
  }

  export function launch(options: Record<string, unknown>): Promise<
    import('node:child_process').ChildProcess
  >
}

declare module '@xmcl/file-transfer' {
  export function download(options: {
    url: string | string[]
    destination: string
    expectedTotal?: number
    signal?: AbortSignal
    headers?: Record<string, unknown>
  }): Promise<void>
}
