import { BrowserWindow } from 'electron'
import { Minecraft, Xbox, type Auth, types } from 'msmc'
import { resolveMicrosoftLoginIconPath } from '../windows/appIcon'

const FETCH_MS = 20_000

type JsonResult = {
  ok: boolean
  status: number
  json: Record<string, unknown>
}

async function fetchJson(url: string, init?: RequestInit): Promise<JsonResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_MS)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    const text = await res.text()
    let json: Record<string, unknown> = {}
    if (text) {
      try {
        json = JSON.parse(text) as Record<string, unknown>
      } catch {
        json = { raw: text.slice(0, 200) }
      }
    }
    return { ok: res.ok, status: res.status, json }
  } finally {
    clearTimeout(timer)
  }
}

function readCodeFromUrl(raw: string): string | null {
  try {
    const url = new URL(raw)
    return url.searchParams.get('code')
  } catch {
    const q = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw
    return new URLSearchParams(q).get('code')
  }
}

/**
 * msmc の electron GUI（dynamic import の二重 default）を使わず、
 * メインプロセスの BrowserWindow で認証コードを取る。
 */
export function openMicrosoftLoginWindow(
  auth: Auth,
  opts: { width: number; height: number; title: string },
): Promise<string> {
  const redirect = auth.token.redirect
  return new Promise((resolve, reject) => {
    const icon = resolveMicrosoftLoginIconPath()
    const win = new BrowserWindow({
      width: opts.width,
      height: opts.height,
      title: opts.title,
      autoHideMenuBar: true,
      resizable: true,
      ...(icon ? { icon } : {}),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })
    win.setMenu(null)
    if (icon) {
      try {
        win.setIcon(icon)
      } catch {
        // unpackaged / missing icon
      }
    }

    let settled = false
    const finish = (code: string | null, err?: string) => {
      if (settled) return
      settled = true
      try {
        if (!win.isDestroyed()) win.close()
      } catch {
        /* ignore */
      }
      if (code) resolve(code)
      else reject(new Error(err ?? 'error.gui.closed'))
    }

    const onUrl = (raw: string) => {
      if (!raw.startsWith(redirect)) return false
      const code = readCodeFromUrl(raw)
      if (code) {
        finish(code)
        return true
      }
      finish(null, 'error.auth.microsoft')
      return true
    }

    win.webContents.on('will-redirect', (event, url) => {
      if (onUrl(url)) event.preventDefault()
    })
    win.webContents.on('did-navigate', (_e, url) => {
      onUrl(url)
    })
    win.webContents.on('did-finish-load', () => {
      onUrl(win.webContents.getURL())
    })
    win.on('closed', () => {
      finish(null, 'error.gui.closed')
    })

    void win.loadURL(auth.createLink())
  })
}

type McStore = {
  items?: Array<{ name?: string }>
}

async function xboxFromMsToken(auth: Auth, ms: JsonResult): Promise<Xbox> {
  const accessToken = typeof ms.json.access_token === 'string' ? ms.json.access_token : ''
  const refreshToken = typeof ms.json.refresh_token === 'string' ? ms.json.refresh_token : ''
  if (!ms.ok || !accessToken || !refreshToken) {
    throw Object.assign(new Error('error.auth.microsoft'), { status: ms.status })
  }

  const xboxLive = await fetchJson('https://user.auth.xboxlive.com/user/authenticate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${accessToken}`,
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT',
    }),
  })
  if (!xboxLive.ok || typeof xboxLive.json.Token !== 'string') {
    throw Object.assign(new Error('error.auth.xboxLive'), { status: xboxLive.status })
  }

  return new Xbox(
    auth,
    {
      token_type: String(ms.json.token_type ?? 'bearer'),
      expires_in: Number(ms.json.expires_in ?? 3600),
      scope: String(ms.json.scope ?? ''),
      access_token: accessToken,
      refresh_token: refreshToken,
      user_id: String(ms.json.user_id ?? ''),
      foci: String(ms.json.foci ?? ''),
    },
    xboxLive.json as unknown as types.XblAuthToken,
  )
}

export async function xboxFromAuthCode(auth: Auth, code: string): Promise<Xbox> {
  const token = auth.token
  const body = new URLSearchParams({
    client_id: token.client_id,
    code,
    grant_type: 'authorization_code',
    redirect_uri: token.redirect,
  })
  if (token.clientSecret) body.set('client_secret', token.clientSecret)

  const ms = await fetchJson('https://login.live.com/oauth20_token.srf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  return xboxFromMsToken(auth, ms)
}

/**
 * msmc の Auth.refresh は node-fetch 依存で、製品版 Electron では失敗・ハングすることがある。
 * ランタイムの fetch でリフレッシュトークンを交換する。
 */
export async function xboxFromRefreshToken(auth: Auth, refreshToken: string): Promise<Xbox> {
  const token = auth.token
  const body = new URLSearchParams({
    client_id: token.client_id,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  if (token.clientSecret) body.set('client_secret', token.clientSecret)

  const ms = await fetchJson('https://login.live.com/oauth20_token.srf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  return xboxFromMsToken(auth, ms)
}

/** XSTS の XErr → ユーザーが対処できる原因コード */
function xstsErrorMessage(xerr: unknown): string {
  switch (Number(xerr)) {
    case 2148916233:
      // Microsoft アカウントに Xbox プロフィールがない
      return 'error.auth.xsts.noXboxAccount'
    case 2148916235:
      return 'error.auth.xsts.region'
    case 2148916236:
    case 2148916237:
      return 'error.auth.xsts.adultVerification'
    case 2148916238:
      // 未成年アカウント（ファミリーグループへの追加が必要）
      return 'error.auth.xsts.childAccount'
    default:
      return 'error.auth.xsts'
  }
}

async function minecraftIdentityToken(xbox: Xbox): Promise<string> {
  const userToken = xbox.xblToken?.Token
  if (!userToken) throw new Error('error.auth.xboxLive')
  const xsts = await fetchJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      Properties: { SandboxId: 'RETAIL', UserTokens: [userToken] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT',
    }),
  })
  const claims = xsts.json.DisplayClaims as { xui?: Array<{ uhs?: string }> } | undefined
  const uhs = claims?.xui?.[0]?.uhs
  const token = typeof xsts.json.Token === 'string' ? xsts.json.Token : ''
  if (!xsts.ok || !uhs || !token) {
    throw Object.assign(new Error(xstsErrorMessage(xsts.json.XErr)), {
      status: xsts.status,
      xerr: xsts.json.XErr,
    })
  }
  return `XBL3.0 x=${uhs};${token}`
}

/**
 * msmc の getMinecraft() は node-fetch 依存で、プロフィール取得が戻らないことがある。
 * Xbox トークンまでは msmc を使い、Minecraft 側はランタイムの fetch で取る。
 */
export async function minecraftFromXbox(xbox: Xbox): Promise<Minecraft> {
  const identityToken = await minecraftIdentityToken(xbox)
  const login = await fetchJson('https://api.minecraftservices.com/authentication/login_with_xbox', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ identityToken }),
  })
  const accessToken = typeof login.json.access_token === 'string' ? login.json.access_token : ''
  if (!login.ok || !accessToken) {
    throw Object.assign(new Error('error.auth.minecraft.login'), { status: login.status })
  }

  const profileRes = await fetchJson('https://api.minecraftservices.com/minecraft/profile', {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })
  const profileJson = profileRes.json
  const id = typeof profileJson.id === 'string' ? profileJson.id : ''
  const name = typeof profileJson.name === 'string' ? profileJson.name : ''

  if (profileRes.ok && id && name) {
    return new Minecraft(accessToken, { id, name }, xbox)
  }

  const entitlements = await fetchJson('https://api.minecraftservices.com/entitlements/mcstore', {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })
  const names = ((entitlements.json as McStore).items ?? []).map((item) => item.name ?? '')
  const owned = names.includes('game_minecraft') || names.includes('product_minecraft')
  if (!owned) {
    // 所有していない（Java 版のライセンスなし / Game Pass 未加入）
    throw Object.assign(new Error('error.auth.minecraft.notOwned'), { status: profileRes.status })
  }

  const username = typeof login.json.username === 'string' ? login.json.username : id
  return new Minecraft(
    accessToken,
    { id: username || id || 'unknown', name: name || 'Player' },
    xbox,
  )
}

export function formatMsmcError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message
  if (err && typeof err === 'object') {
    const rec = err as { ts?: unknown; message?: unknown }
    if (typeof rec.ts === 'string') return rec.ts
    if (typeof rec.message === 'string') return rec.message
    try {
      return JSON.stringify(err)
    } catch {
      return String(err)
    }
  }
  return String(err)
}
