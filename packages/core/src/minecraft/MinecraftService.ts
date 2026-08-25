import {
  installMinecraft,
  completeInstallation,
  getFabricLoaders,
  installFabric,
  installForge,
  installNeoForge,
  installQuiltVersion,
} from '@xmcl/installer'
import { Version, launch, LaunchPrecheck, MinecraftFolder } from '@xmcl/core'
import type { ChildProcess } from 'node:child_process'
import type { InstanceProfile } from '@fledge/shared'
import type { PathLayout } from '../app/paths.js'
import type { DownloadContext, DownloadQueue } from '../download/DownloadQueue.js'
import type { Logger } from '../logging/Logger.js'
import type { LaunchCredentials } from '../auth/authTypes.js'
import { sessionHostJvmArgs } from '../auth/SessionJoinProxy.js'
import { withInstallTracker } from './installProgress.js'
import {
  findInstalledVersionId,
  findReadyVersionId,
  isVersionComplete,
  nativesRoot,
  readyKey,
  writeReadyRecord,
} from './installReady.js'
import { getCachedVersionList } from './mojangVersionListCache.js'

type ParsedVersion = Awaited<ReturnType<typeof Version.parse>>

/**
 * Minecraft のインストール・起動。
 * 共有データは Data/Minecraft、ゲーム固有ディレクトリは Instances/<id>。
 * バージョン一覧は VersionService 側。
 */
export class MinecraftService {
  private readonly inflight = new Map<string, Promise<string>>()
  /** 同一 versionId の Version.parse を起動／修復中に再利用 */
  private readonly parsedVersionCache = new Map<string, Promise<ParsedVersion>>()

  constructor(
    private readonly layout: PathLayout,
    private readonly queue: DownloadQueue,
    private readonly logger: Logger,
  ) {}

  async ensureInstalled(
    profile: InstanceProfile,
    _instanceDir: string,
    sessionId: string,
    javaPath?: string,
  ): Promise<string> {
    const key = readyKey(profile)
    const existing = this.inflight.get(key)
    if (existing) return existing
    const run = this.ensureInstalledInner(profile, sessionId, javaPath).finally(() => {
      this.inflight.delete(key)
    })
    this.inflight.set(key, run)
    return run
  }

  private async ensureInstalledInner(
    profile: InstanceProfile,
    sessionId: string,
    javaPath?: string,
  ): Promise<string> {
    const readyId = await findReadyVersionId(this.layout.minecraft, profile)
    if (readyId) {
      this.logger.info('minecraft', `Reusing installed ${readyId} (skip network install)`)
      this.queue.emitStatus(sessionId, 'launch.install.natives')
      await this.ensureNatives(readyId)
      return readyId
    }

    const partialId = await findInstalledVersionId(this.layout.minecraft, profile)
    if (partialId) {
      this.logger.info('minecraft', `Repairing incomplete ${partialId}`)
      this.queue.emitStatus(sessionId, 'launch.install.libraries')
      await this.repairInstallation(partialId, javaPath)
      if (await isVersionComplete(this.layout.minecraft, partialId)) {
        await writeReadyRecord(this.layout.minecraft, profile, partialId)
        this.queue.emitStatus(sessionId, 'launch.install.natives')
        await this.ensureNatives(partialId)
        return partialId
      }
    }

    this.logger.info(
      'minecraft',
      `Installing ${profile.loader} ${profile.minecraftVersion}${profile.loaderVersion ? ` (${profile.loaderVersion})` : ''}`,
    )
    const installedId = await this.installFromNetwork(profile, sessionId, javaPath)
    if (!(await isVersionComplete(this.layout.minecraft, installedId))) {
      throw Object.assign(new Error(`Incomplete install: ${installedId}`), {
        messageKey: 'launch.error.generic',
      })
    }
    await this.ensureNatives(installedId)
    return installedId
  }

  private async repairInstallation(versionId: string, javaPath?: string): Promise<void> {
    const resolved = await this.parseVersion(versionId)
    await completeInstallation(resolved, javaPath ? { java: javaPath } : {})
  }

  private parseVersion(versionId: string): Promise<ParsedVersion> {
    let pending = this.parsedVersionCache.get(versionId)
    if (!pending) {
      pending = Version.parse(this.layout.minecraft, versionId).catch((err) => {
        this.parsedVersionCache.delete(versionId)
        throw err
      })
      this.parsedVersionCache.set(versionId, pending)
    }
    return pending
  }

  private async ensureNatives(versionId: string): Promise<void> {
    const resolved = await this.parseVersion(versionId)
    const folder = new MinecraftFolder(this.layout.minecraft)
    await LaunchPrecheck.checkNatives(folder, resolved, {
      nativeRoot: nativesRoot(this.layout.minecraft, versionId),
    })
  }

  private loaderInstallOptions(javaPath?: string) {
    if (!javaPath) {
      throw Object.assign(new Error('Java is required to install Forge/NeoForge'), {
        messageKey: 'launch.error.generic',
      })
    }
    return { java: javaPath, side: 'client' as const }
  }

  private async completeTracked(
    ctx: DownloadContext,
    resolved: unknown,
    fallbackKey: string,
    javaPath?: string,
  ) {
    await withInstallTracker(ctx, fallbackKey, (tracker, signal) =>
      completeInstallation(resolved, {
        tracker,
        signal,
        ...(javaPath ? { java: javaPath } : {}),
      }),
    )
  }

  private async installFromNetwork(
    profile: InstanceProfile,
    sessionId: string,
    javaPath?: string,
  ): Promise<string> {
    const { done: vanillaDone } = this.queue.enqueue({
      kind: 'minecraft-client',
      labelKey: 'launch.install.client',
      sessionId,
      meta: { instanceId: profile.id, version: profile.minecraftVersion },
      execute: async (ctx) => {
        ctx.report({
          current: 0,
          total: 1,
          unit: 'count',
          messageKey: 'launch.install.versionList',
        })
        const location = this.layout.minecraft
        const manifest = await getCachedVersionList()
        const meta = manifest.versions.find((v) => v.id === profile.minecraftVersion)
        if (!meta) {
          throw Object.assign(new Error(`Version not found: ${profile.minecraftVersion}`), {
            messageKey: 'launch.error.generic',
          })
        }

        this.logger.info('minecraft', `Installing Minecraft ${profile.minecraftVersion}`)
        ctx.setKind('minecraft-client')
        ctx.report({
          messageKey: 'launch.install.client',
          meta: { version: profile.minecraftVersion },
        })
        const resolvedVanilla = await withInstallTracker(
          ctx,
          'launch.install.client',
          (tracker, signal) => installMinecraft(meta, location, { tracker, signal }),
        )

        ctx.setKind('library')
        ctx.report({ messageKey: 'launch.install.libraries' })
        await this.completeTracked(ctx, resolvedVanilla, 'launch.install.libraries')
      },
    })
    await vanillaDone

    if (profile.loader === 'vanilla') {
      await writeReadyRecord(this.layout.minecraft, profile, profile.minecraftVersion)
      this.queue.emitStatus(sessionId, 'launch.install.natives')
      return profile.minecraftVersion
    }

    if (profile.loader === 'fabric') {
      let installedId = ''
      const { done } = this.queue.enqueue({
        kind: 'fabric-loader',
        labelKey: 'launch.install.fabric',
        sessionId,
        meta: { version: profile.loaderVersion ?? '' },
        execute: async (ctx) => {
          ctx.report({
            current: 0,
            total: 2,
            unit: 'count',
            messageKey: 'launch.install.fabric',
            meta: { version: profile.loaderVersion ?? '' },
          })
          const loaders = await getFabricLoaders()
          const loader =
            (profile.loaderVersion
              ? loaders.find((l) => l.version === profile.loaderVersion)
              : undefined) ??
            loaders.find((l) => l.stable) ??
            loaders[0]
          if (!loader) {
            throw Object.assign(new Error('Fabric loader not found'), {
              messageKey: 'launch.error.generic',
            })
          }

          this.logger.info(
            'minecraft',
            `Installing Fabric ${loader.version} for ${profile.minecraftVersion}`,
          )
          ctx.report({
            messageKey: 'launch.install.fabric',
            meta: { version: loader.version },
          })
          installedId = await installFabric({
            minecraftVersion: profile.minecraftVersion,
            version: loader.version,
            minecraft: this.layout.minecraft,
            side: 'client',
          })
          ctx.report({ current: 1, total: 2, unit: 'count', messageKey: 'launch.install.libraries' })
          const resolved = await this.parseVersion(installedId)
          await this.completeTracked(ctx, resolved, 'launch.install.libraries', javaPath)
        },
      })
      await done
      await writeReadyRecord(this.layout.minecraft, profile, installedId)
      this.queue.emitStatus(sessionId, 'launch.install.natives')
      return installedId
    }

    if (profile.loader === 'forge') {
      let installedId = ''
      const forgeVersion = profile.loaderVersion
      if (!forgeVersion) {
        throw Object.assign(new Error('Forge loader version is required'), {
          messageKey: 'launch.error.generic',
        })
      }
      const { done } = this.queue.enqueue({
        kind: 'forge-loader',
        labelKey: 'launch.install.forge',
        sessionId,
        meta: { version: forgeVersion },
        execute: async (ctx) => {
          ctx.report({
            current: 0,
            total: 2,
            unit: 'count',
            messageKey: 'launch.install.forge',
            meta: { version: forgeVersion },
          })
          this.logger.info(
            'minecraft',
            `Installing Forge ${forgeVersion} for ${profile.minecraftVersion}`,
          )
          installedId = await withInstallTracker(ctx, 'launch.install.forge', (tracker, signal) =>
            installForge(
              { version: forgeVersion, mcversion: profile.minecraftVersion },
              this.layout.minecraft,
              { ...this.loaderInstallOptions(javaPath), tracker, signal },
            ),
          )
          ctx.report({ current: 1, total: 2, unit: 'count', messageKey: 'launch.install.libraries' })
          const resolved = await this.parseVersion(installedId)
          await this.completeTracked(ctx, resolved, 'launch.install.libraries', javaPath)
        },
      })
      await done
      await writeReadyRecord(this.layout.minecraft, profile, installedId)
      this.queue.emitStatus(sessionId, 'launch.install.natives')
      return installedId
    }

    if (profile.loader === 'neoforge') {
      let installedId = ''
      const neoVersion = profile.loaderVersion
      if (!neoVersion) {
        throw Object.assign(new Error('NeoForge loader version is required'), {
          messageKey: 'launch.error.generic',
        })
      }
      const { done } = this.queue.enqueue({
        kind: 'neoforge-loader',
        labelKey: 'launch.install.neoforge',
        sessionId,
        meta: { version: neoVersion },
        execute: async (ctx) => {
          ctx.report({
            current: 0,
            total: 2,
            unit: 'count',
            messageKey: 'launch.install.neoforge',
            meta: { version: neoVersion },
          })
          this.logger.info(
            'minecraft',
            `Installing NeoForge ${neoVersion} for ${profile.minecraftVersion}`,
          )
          installedId = await withInstallTracker(ctx, 'launch.install.neoforge', (tracker, signal) =>
            installNeoForge('neoforge', neoVersion, this.layout.minecraft, {
              ...this.loaderInstallOptions(javaPath),
              tracker,
              signal,
            }),
          )
          ctx.report({ current: 1, total: 2, unit: 'count', messageKey: 'launch.install.libraries' })
          const resolved = await this.parseVersion(installedId)
          await this.completeTracked(ctx, resolved, 'launch.install.libraries', javaPath)
        },
      })
      await done
      await writeReadyRecord(this.layout.minecraft, profile, installedId)
      this.queue.emitStatus(sessionId, 'launch.install.natives')
      return installedId
    }

    if (profile.loader === 'quilt') {
      let installedId = ''
      const quiltVersion = profile.loaderVersion
      if (!quiltVersion) {
        throw Object.assign(new Error('Quilt loader version is required'), {
          messageKey: 'launch.error.generic',
        })
      }
      const { done } = this.queue.enqueue({
        kind: 'quilt-loader',
        labelKey: 'launch.install.quilt',
        sessionId,
        meta: { version: quiltVersion },
        execute: async (ctx) => {
          ctx.report({
            current: 0,
            total: 2,
            unit: 'count',
            messageKey: 'launch.install.quilt',
            meta: { version: quiltVersion },
          })
          this.logger.info(
            'minecraft',
            `Installing Quilt ${quiltVersion} for ${profile.minecraftVersion}`,
          )
          installedId = await installQuiltVersion({
            minecraftVersion: profile.minecraftVersion,
            version: quiltVersion,
            minecraft: this.layout.minecraft,
            side: 'client',
          })
          ctx.report({ current: 1, total: 2, unit: 'count', messageKey: 'launch.install.libraries' })
          const resolved = await this.parseVersion(installedId)
          await this.completeTracked(ctx, resolved, 'launch.install.libraries', javaPath)
        },
      })
      await done
      await writeReadyRecord(this.layout.minecraft, profile, installedId)
      this.queue.emitStatus(sessionId, 'launch.install.natives')
      return installedId
    }

    throw Object.assign(new Error(`Loader not supported: ${profile.loader}`), {
      messageKey: 'launch.error.generic',
    })
  }

  async launchGame(options: {
    profile: InstanceProfile
    instanceDir: string
    versionId: string
    javaPath: string
    credentials: LaunchCredentials
    display: {
      fullscreen: boolean
      width: number
      height: number
    }
    /** true のとき Fledge の RPC を優先し、Minecraft 本体の Discord 表示は出さない */
    fledgeDiscordRpc?: boolean
    /** 1.20.2+ の session host 差し替え（無効セッション時の再接続用） */
    sessionHost?: string
  }): Promise<ChildProcess> {
    const { profile, instanceDir, versionId, javaPath, credentials, display } = options
    const maxMb = profile.memory.maxMb
    const minMb = profile.memory.minMb ?? Math.min(512, maxMb)

    this.logger.info(
      'minecraft',
      `Launching ${versionId} @ ${instanceDir} (${display.fullscreen ? 'fullscreen' : `${display.width}x${display.height}`})`,
    )

    const proc = await launch({
      gamePath: instanceDir,
      resourcePath: this.layout.minecraft,
      javaPath,
      version: versionId,
      nativeRoot: nativesRoot(this.layout.minecraft, versionId),
      prechecks: [LaunchPrecheck.checkNatives, LaunchPrecheck.linkAssets],
      gameProfile: {
        id: credentials.uuid,
        name: credentials.name,
      },
      accessToken: credentials.accessToken,
      userType: 'msa' as 'mojang',
      minMemory: minMb,
      maxMemory: maxMb,
      extraJVMArgs: withLaunchJvmArgs(
        profile.jvmArgs,
        Boolean(options.fledgeDiscordRpc),
        options.sessionHost,
      ),
      resolution: {
        width: display.width,
        height: display.height,
        fullscreen: display.fullscreen,
      },
      extraExecOption: {
        cwd: instanceDir,
      },
      ignoreInvalidMinecraftCertificates: profile.loader === 'forge' || profile.loader === 'neoforge',
      ignorePatchDiscrepancies: profile.loader === 'forge' || profile.loader === 'neoforge',
    })

    return proc
  }
}

/** Discord がサードパーティ起動を Minecraft として検出するための目印 */
const VANILLA_DISCORD_DETECT = '-DAllowMcDiscordDetection=net.minecraft.client.main.Main'
/** Fledge RPC 使用時に Minecraft 本体の Discord 連携を抑止する */
const DISABLE_VANILLA_DISCORD = '-Dminecraft.client.discord.disable=true'

function withDiscordJvmArgs(base: string[], fledgeRpc: boolean): string[] {
  const next = base.filter(
    (arg) =>
      arg !== VANILLA_DISCORD_DETECT &&
      arg !== DISABLE_VANILLA_DISCORD &&
      !arg.startsWith('-DAllowMcDiscordDetection='),
  )
  if (fledgeRpc) next.push(DISABLE_VANILLA_DISCORD)
  else next.push(VANILLA_DISCORD_DETECT)
  return next
}

function withLaunchJvmArgs(
  base: string[],
  fledgeRpc: boolean,
  sessionHost?: string,
): string[] {
  const next = withDiscordJvmArgs(base, fledgeRpc).filter(
    (arg) =>
      !arg.startsWith('-Dminecraft.api.env=') &&
      !arg.startsWith('-Dminecraft.api.auth.host=') &&
      !arg.startsWith('-Dminecraft.api.account.host=') &&
      !arg.startsWith('-Dminecraft.api.session.host=') &&
      !arg.startsWith('-Dminecraft.api.services.host=') &&
      !arg.startsWith('-Dminecraft.api.profiles.host='),
  )
  if (sessionHost) next.push(...sessionHostJvmArgs(sessionHost))
  return next
}
