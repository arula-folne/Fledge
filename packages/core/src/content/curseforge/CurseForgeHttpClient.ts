/**
 * CurseForge API 向け HTTP クライアント。
 * x-api-key を自動付与し、キーをログ／エラー文字列に載せない。
 *
 * 将来のサーバープロキシ切替は `baseUrl` / `resolveApiKey` の差し替えで行う。
 */

export class CurseForgeApiError extends Error {
  readonly status: number | null
  readonly code: 'missing_key' | 'unauthorized' | 'forbidden' | 'http' | 'network'

  constructor(
    message: string,
    opts: { status?: number | null; code: CurseForgeApiError['code']; cause?: unknown },
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined)
    this.name = 'CurseForgeApiError'
    this.status = opts.status ?? null
    this.code = opts.code
  }
}

export type CurseForgeHttpClientOptions = {
  /** 既定: https://api.curseforge.com/v1 。プロキシ時はここを差し替え */
  baseUrl?: string
  resolveApiKey: () => Promise<string | undefined>
  userAgent?: string
}

function sanitizeBodySnippet(body: string): string {
  // レスポンス本文にキーが混入しても外へ出さない
  return body.replace(/[A-Za-z0-9_-]{20,}/g, '[redacted]').slice(0, 120)
}

export class CurseForgeHttpClient {
  private readonly baseUrl: string
  private readonly resolveApiKey: () => Promise<string | undefined>
  private readonly userAgent: string

  constructor(options: CurseForgeHttpClientOptions) {
    this.baseUrl = (options.baseUrl ?? 'https://api.curseforge.com/v1').replace(/\/$/, '')
    this.resolveApiKey = options.resolveApiKey
    this.userAgent = options.userAgent ?? 'Fledge/0.1.0 (curseforge-client)'
  }

  async get<T>(path: string, init?: Omit<RequestInit, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...init, method: 'GET' })
  }

  async post<T>(path: string, body?: unknown, init?: Omit<RequestInit, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, {
      ...init,
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const key = (await this.resolveApiKey())?.trim()
    if (!key) {
      throw new CurseForgeApiError('CurseForge APIキーが設定されていません。', {
        code: 'missing_key',
        status: null,
      })
    }

    const url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`

    let res: Response
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          'User-Agent': this.userAgent,
          'x-api-key': key,
          ...(init.headers ?? {}),
        },
      })
    } catch (cause) {
      throw new CurseForgeApiError('CurseForge への接続に失敗しました。', {
        code: 'network',
        status: null,
        cause,
      })
    }

    if (res.status === 401) {
      throw new CurseForgeApiError(
        'CurseForge の認証に失敗しました。APIキーを確認してください。',
        { code: 'unauthorized', status: 401 },
      )
    }
    if (res.status === 403) {
      throw new CurseForgeApiError(
        'CurseForge APIへのアクセスが拒否されました。キーの権限を確認してください。',
        { code: 'forbidden', status: 403 },
      )
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new CurseForgeApiError(
        `CurseForge API エラー (${res.status})${body ? `: ${sanitizeBodySnippet(body)}` : ''}`,
        { code: 'http', status: res.status },
      )
    }

    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }
}
