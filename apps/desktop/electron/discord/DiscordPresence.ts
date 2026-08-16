import { Client } from '@xhayper/discord-rpc'
import { BRAND, DISCORD_APPLICATION_ID, type LogSource } from '@fledge/shared'

export type PresencePhase = 'idle' | 'preparing' | 'launching' | 'running'

export type PresenceContext = {
  phase: PresencePhase
  instanceName?: string
  minecraftVersion?: string
  loader?: string
}

type LogLike = {
  info: (scope: LogSource, message: string) => void
  warn: (scope: LogSource, message: string) => void
}

/**
 * Discord Rich Presence（表示名は Discord Application の「Fledge」）。
 * 設定変更で即時に接続／切断する。
 */
export class DiscordPresence {
  private client: Client | null = null
  private enabled = false
  private connecting: Promise<void> | null = null
  private startedAt = Date.now()
  private context: PresenceContext = { phase: 'idle' }
  private generation = 0

  constructor(private readonly log: LogLike) {}

  /** トグルを即時反映 */
  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled
    this.generation += 1
    if (!enabled) {
      await this.disconnect()
      return
    }
    this.startedAt = Date.now()
    await this.ensureConnected()
    await this.refresh()
  }

  setContext(partial: Partial<PresenceContext>): void {
    this.context = { ...this.context, ...partial }
    if (partial.phase === 'running' || partial.phase === 'preparing' || partial.phase === 'launching') {
      // ゲーム開始系は経過時間をリセット
      if (partial.phase === 'running') this.startedAt = Date.now()
    }
    if (partial.phase === 'idle') {
      this.startedAt = Date.now()
    }
    void this.refresh()
  }

  async destroy(): Promise<void> {
    this.enabled = false
    this.generation += 1
    await this.disconnect()
  }

  private async ensureConnected(): Promise<void> {
    if (!this.enabled) return
    if (this.client?.isConnected) return
    if (this.connecting) {
      await this.connecting
      return
    }

    const gen = this.generation
    this.connecting = (async () => {
      try {
        const client = new Client({
          clientId: process.env.FLEDGE_DISCORD_CLIENT_ID || DISCORD_APPLICATION_ID,
          transport: { type: 'ipc' },
        })
        client.on('disconnected', () => {
          this.log.warn('discord', 'RPC disconnected')
          if (this.client === client) this.client = null
          if (this.enabled) {
            // Discord 再起動などに備えて遅延再接続
            setTimeout(() => {
              if (this.enabled && this.generation === gen) void this.ensureConnected().then(() => this.refresh())
            }, 5000)
          }
        })
        await client.login()
        if (this.generation !== gen || !this.enabled) {
          try {
            await client.destroy()
          } catch {
            /* ignore */
          }
          return
        }
        this.client = client
        this.log.info('discord', 'RPC connected (Fledge)')
      } catch (err) {
        this.client = null
        this.log.warn(
          'discord',
          `RPC connect failed: ${err instanceof Error ? err.message : String(err)}`,
        )
      } finally {
        this.connecting = null
      }
    })()

    await this.connecting
  }

  private async disconnect(): Promise<void> {
    const client = this.client
    this.client = null
    this.connecting = null
    if (!client) return
    try {
      if (client.user) await client.user.clearActivity()
    } catch {
      /* ignore */
    }
    try {
      await client.destroy()
    } catch {
      /* ignore */
    }
    this.log.info('discord', 'RPC cleared')
  }

  private async refresh(): Promise<void> {
    if (!this.enabled) return
    await this.ensureConnected()
    const client = this.client
    if (!client?.isConnected || !client.user) return

    const { details, name } = this.describe()
    try {
      await client.user.setActivity({
        name,
        type: 0, // ActivityType.Playing
        details,
        // 1 行目はアプリ名「Fledge」、2 行目は details
        statusDisplayType: 0,
        startTimestamp: this.startedAt,
        largeImageKey: 'fledge',
        largeImageText: BRAND.tagline,
      })
    } catch (err) {
      this.log.warn(
        'discord',
        `setActivity failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  private describe(): { name: string; details: string } {
    const { phase, instanceName } = this.context
    const instance = instanceName?.trim()
    switch (phase) {
      case 'preparing':
      case 'launching':
        return {
          name: BRAND.name,
          details: instance ? `${instance}を起動中` : '起動中',
        }
      case 'running':
        return {
          name: BRAND.name,
          details: instance ? `${instance}をプレイ中` : 'Minecraftをプレイ中',
        }
      default:
        return {
          name: BRAND.name,
          details: 'ランチャー',
        }
    }
  }
}
