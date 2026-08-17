import {
  getVersionList,
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
import type { DownloadQueue } from '../download/DownloadQueue.js'
import type { Logger } from '../logging/Logger.js'
import type { LaunchCredentials } from '../auth/authTypes.js'
import { sessionHostJvmArgs } from '../auth/SessionJoinProxy.js'
import {
  findReadyVersionId,
  nativesRoot,
  readyKey,
  writeReadyRecord,
} from './installReady.js'

/**
 * Minecraft のインストール・起動。
 * 共有データは Data/Minecraft、ゲーム固有ディレクトリは Instances/<id>。
 * バージョン一覧は VersionService 側。
 */
export class MinecraftService {
  private readonly inflight = new Map<string, Promise<string>>()

  constructor(
    private readonly layout: PathLayout,
    private readonly queue: DownloadQueue,
    private readonly logger: Logger,
  ) {}

  async ensureInstalled(
    profile: InstanceProfile,
    _instanceDir: string,
    sessionId: string,
  ): Promise<string> {
    const key = readyKey(profile)
    const existing = this.inflight.get(key)
    if (existing) return existing
    const run = this.ensureInstalledInner(profile, sessionId).finally(() => {
      this.inflight.delete(key)
    })
    this.inflight.set(key, run)
    return run
  }

  private async ensureInstalledInner(profile: InstanceProfile, sessionId: string): Promise<string> {
    const readyId = await findReadyVersionId(this.layout.minecraft, profile)
    if (readyId) {
      this.logger.info('minecraft', `Reusing installed ${readyId} (skip network install)`)
      await this.ensureNatives(readyId)
      return readyId
    }
    const installedId = await this.installFromNetwork(profile, sessionId)
    await this.ensureNatives(installedId)
    return installedId
  }

  private async ensureNatives(versionId: string): Promise<void> {
    try {
      const resolved = await Version.parse(this.layout.minecraft, versionId)
      const folder = new MinecraftFolder(this.layout.minecraft)
      await LaunchPrecheck.checkNatives(folder, resolved, {
        nativeRoot: nativesRoot(this.layout.minecraft, versionId),
      })
    } catch (err) {
      this.logger.warn(
        'minecraft',
        `Native prepare skipped: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  private async installFromNetwork(profile: InstanceProfile, sessionId: string): Promise<string> {
    const { done: vanillaDone } = this.queue.enqueue({
      kind: 'minecraft-client',
      labelKey: 'launch.phase.install',
      sessionId,
      meta: { instanceId: profile.id },
      execute: async (ctx) => {
        ctx.report({ current: 0, total: 3, unit: 'count' })
        const location = this.layout.minecraft
        const manifest = await getVersionList()
        const meta = manifest.versions.find((v) => v.id === profile.minecraftVersion)
        if (!meta) {
          throw Object.assign(new Error(`Version not found: ${profile.minecraftVersion}`), {
            messageKey: 'launch.error.generic',
          })
        }

        this.logger.info('minecraft', `Installing Minecraft ${profile.minecraftVersion}`)
        ctx.setKind('minecraft-client')
        const resolvedVanilla = await installMinecraft(meta, location)
        ctx.report({ current: 1, total: 3, unit: 'count' })

        ctx.setKind('library')
        await completeInstallation(resolvedVanilla)
        ctx.setKind('asset')
        ctx.report({ current: 3, total: 3, unit: 'count' })
      },
    })
    await vanillaDone

    if (profile.loader === 'vanilla') {
      await writeReadyRecord(this.layout.minecraft, profile, profile.minecraftVersion)
      return profile.minecraftVersion
    }

    if (profile.loader === 'fabric') {
      let installedId = ''
      const { done } = this.queue.enqueue({
        kind: 'fabric-loader',
        labelKey: 'launch.phase.install',
        sessionId,
        execute: async (ctx) => {
          ctx.report({ current: 0, total: 2, unit: 'count' })
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
          installedId = await installFabric({
            minecraftVersion: profile.minecraftVersion,
            version: loader.version,
            minecraft: this.layout.minecraft,
          })
          ctx.report({ current: 1, total: 2, unit: 'count' })

          const resolved = await Version.parse(this.layout.minecraft, installedId)
          await completeInstallation(resolved)
          ctx.report({ current: 2, total: 2, unit: 'count' })
        },
      })
      await done
      await writeReadyRecord(this.layout.minecraft, profile, installedId)
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
        labelKey: 'launch.phase.install',
        sessionId,
        execute: async (ctx) => {
          ctx.report({ current: 0, total: 2, unit: 'count' })
          this.logger.info(
            'minecraft',
            `Installing Forge ${forgeVersion} for ${profile.minecraftVersion}`,
          )
          installedId = await installForge(
            { version: forgeVersion, mcversion: profile.minecraftVersion },
            this.layout.minecraft,
          )
          ctx.report({ current: 1, total: 2, unit: 'count' })
          const resolved = await Version.parse(this.layout.minecraft, installedId)
          await completeInstallation(resolved)
          ctx.report({ current: 2, total: 2, unit: 'count' })
        },
      })
      await done
      await writeReadyRecord(this.layout.minecraft, profile, installedId)
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
        labelKey: 'launch.phase.install',
        sessionId,
        execute: async (ctx) => {
          ctx.report({ current: 0, total: 2, unit: 'count' })
          this.logger.info(
            'minecraft',
            `Installing NeoForge ${neoVersion} for ${profile.minecraftVersion}`,
          )
          installedId = await installNeoForge('neoforge', neoVersion, this.layout.minecraft)
          ctx.report({ current: 1, total: 2, unit: 'count' })
          const resolved = await Version.parse(this.layout.minecraft, installedId)
          await completeInstallation(resolved)
          ctx.report({ current: 2, total: 2, unit: 'count' })
        },
      })
      await done
      await writeReadyRecord(this.layout.minecraft, profile, installedId)
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
        labelKey: 'launch.phase.install',
        sessionId,
        execute: async (ctx) => {
          ctx.report({ current: 0, total: 2, unit: 'count' })
          this.logger.info(
            'minecraft',
            `Installing Quilt ${quiltVersion} for ${profile.minecraftVersion}`,
          )
          installedId = await installQuiltVersion({
            minecraftVersion: profile.minecraftVersion,
            version: quiltVersion,
            minecraft: this.layout.minecraft,
          })
          ctx.report({ current: 1, total: 2, unit: 'count' })
          const resolved = await Version.parse(this.layout.minecraft, installedId)
          await completeInstallation(resolved)
          ctx.report({ current: 2, total: 2, unit: 'count' })
        },
      })
      await done
      await writeReadyRecord(this.layout.minecraft, profile, installedId)
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
