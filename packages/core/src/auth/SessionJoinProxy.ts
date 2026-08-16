import http from 'node:http'
import type { AuthProvider } from './AuthProvider.js'
import { AuthError } from './authTypes.js'
import type { Logger } from '../logging/Logger.js'

const MOJANG_SESSION = 'https://sessionserver.mojang.com'
const JOIN_PATH = '/session/minecraft/join'

function normalizeUuid(value: string): string {
  return value.replace(/-/g, '').toLowerCase()
}

/**
 * 実行中クライアントの session join を受け、ランチャー側の新しいトークンで Mojang へ転送する。
 * `-Dminecraft.api.session.host` が効くバージョン（1.20.2 以降）で、ゲームを落とさず再接続できる。
 */
export class SessionJoinProxy {
  private server: http.Server | null = null
  private baseUrl: string | null = null

  constructor(
    private readonly auth: AuthProvider,
    private readonly logger: Logger,
  ) {}

  getUrl(): string | null {
    return this.baseUrl
  }

  async ensureStarted(): Promise<string> {
    if (this.baseUrl) return this.baseUrl
    const server = http.createServer((req, res) => {
      void this.handle(req, res)
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })
    const addr = server.address()
    if (!addr || typeof addr === 'string') {
      server.close()
      throw new Error('Failed to bind session proxy')
    }
    this.server = server
    this.baseUrl = `http://127.0.0.1:${addr.port}`
    this.logger.info('auth', `Session join proxy listening on ${this.baseUrl}`)
    return this.baseUrl
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = null
    this.baseUrl = null
    if (!server) return
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const url = req.url ?? '/'
      if (req.method === 'POST' && url.split('?')[0] === JOIN_PATH) {
        await this.handleJoin(req, res)
        return
      }
      await this.forward(req, res)
    } catch (err) {
      this.logger.warn(
        'auth',
        `Session proxy error: ${err instanceof Error ? err.message : String(err)}`,
      )
      if (!res.headersSent) {
        res.statusCode = 502
        res.end()
      }
    }
  }

  private async handleJoin(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const raw = await readBody(req)
    let payload: { accessToken?: string; selectedProfile?: string; serverId?: string }
    try {
      payload = JSON.parse(raw.toString('utf8')) as typeof payload
    } catch {
      res.statusCode = 400
      res.end()
      return
    }

    const uuid = typeof payload.selectedProfile === 'string' ? payload.selectedProfile : ''
    const nextToken = await this.tokenForProfile(uuid, false)
    if (nextToken) payload.accessToken = nextToken

    let upstream = await postJoin(payload)
    if ((upstream.status === 401 || upstream.status === 403) && uuid) {
      const forced = await this.tokenForProfile(uuid, true)
      if (forced) {
        payload.accessToken = forced
        upstream = await postJoin(payload)
      }
    }

    if (upstream.status === 204 || upstream.status === 200) {
      this.logger.info('auth', 'Session join forwarded')
    } else {
      this.logger.warn('auth', `Session join rejected (${upstream.status})`)
    }

    res.statusCode = upstream.status
    const contentType = upstream.headers.get('content-type')
    if (contentType) res.setHeader('Content-Type', contentType)
    res.end(upstream.body)
  }

  private async tokenForProfile(uuid: string, force: boolean): Promise<string | null> {
    if (!uuid) return null
    const needle = normalizeUuid(uuid)
    try {
      const accounts = await this.auth.listAccounts()
      const account = accounts.find((a) => normalizeUuid(a.uuid || a.id) === needle)
      if (!account) return null
      const creds = await this.auth.ensureCredentials(account.id, { force })
      return creds.accessToken
    } catch (err) {
      if (err instanceof AuthError) {
        this.logger.warn('auth', `Session token refresh failed: ${err.messageKey}`)
        return null
      }
      this.logger.warn(
        'auth',
        `Session token refresh failed: ${err instanceof Error ? err.message : String(err)}`,
      )
      return null
    }
  }

  private async forward(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const path = req.url ?? '/'
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req)
    const headers = collectHeaders(req)
    const upstream = await fetch(`${MOJANG_SESSION}${path}`, {
      method: req.method ?? 'GET',
      headers,
      body,
    })
    res.statusCode = upstream.status
    upstream.headers.forEach((value, key) => {
      if (key === 'transfer-encoding') return
      res.setHeader(key, value)
    })
    res.end(Buffer.from(await upstream.arrayBuffer()))
  }
}

function collectHeaders(req: http.IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value || key === 'host' || key === 'content-length' || key === 'connection') continue
    headers[key] = Array.isArray(value) ? value.join(', ') : value
  }
  return headers
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function postJoin(payload: unknown): Promise<{ status: number; headers: Headers; body: Buffer }> {
  const res = await fetch(`${MOJANG_SESSION}${JOIN_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'Minecraft',
    },
    body: JSON.stringify(payload),
  })
  return {
    status: res.status,
    headers: res.headers,
    body: Buffer.from(await res.arrayBuffer()),
  }
}

/** 1.20.2 以降で session host を差し替える JVM 引数 */
export function sessionHostJvmArgs(sessionHost: string): string[] {
  return [
    '-Dminecraft.api.env=custom',
    '-Dminecraft.api.auth.host=https://authserver.mojang.com',
    '-Dminecraft.api.account.host=https://api.mojang.com',
    `-Dminecraft.api.session.host=${sessionHost}`,
    '-Dminecraft.api.services.host=https://api.minecraftservices.com',
    '-Dminecraft.api.profiles.host=https://api.mojang.com',
  ]
}
