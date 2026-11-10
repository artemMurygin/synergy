import { net, protocol } from 'electron'
import type { AuthService } from './auth/application/auth-service'

export type ProxyAuthPort = Pick<
  AuthService,
  'getAccessToken' | 'refresh' | 'markPasswordChangeRequired' | 'getSessionSignal'
>

const SCHEME = 'cc-api'
const HOST = 'backend'
const PROACTIVE_REFRESH_TTL_MS = 30_000
const ALLOWED_PREFIXES = ['/threads', '/agent', '/tasks', '/users']
const DROPPED_HEADERS = ['authorization', 'cookie', 'host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-authorization', 'x-client-type']

const isAllowedPath = (pathname: string): boolean =>
  ALLOWED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

// Must be called before app.whenReady
export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
    }
  ])
}

interface ProxyRequestInit extends RequestInit {
  duplex: 'half'
  bypassCustomProtocolHandlers: boolean
}

async function readErrorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.clone().json()
    if (typeof body !== 'object' || body === null || !('code' in body)) return null
    return typeof body.code === 'string' ? body.code : null
  } catch {
    return null
  }
}

// Rewrites cc-api://backend/<path> to <backendUrl>/<path>, adds the bearer token and streams the response back
export async function forward(request: Request, backendUrl: string, auth: ProxyAuthPort): Promise<Response> {
  const source = new URL(request.url)
  if (source.hostname !== HOST) return jsonError(400, `Unknown cc-api host: ${source.hostname}`)

  if (!isAllowedPath(source.pathname)) return jsonError(403, 'Path is not allowed')

  const initialToken = await auth.getAccessToken(PROACTIVE_REFRESH_TTL_MS)
  if (initialToken === null) return jsonError(401, 'Not authenticated')

  const baseHeaders = new Headers(request.headers)
  for (const name of DROPPED_HEADERS) baseHeaders.delete(name)

  const target = `${backendUrl}${source.pathname}${source.search}`
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const bufferedBody = hasBody ? await request.arrayBuffer() : undefined
  const signal = AbortSignal.any([request.signal, auth.getSessionSignal()])

  const send = (token: string): Promise<Response> => {
    const headers = new Headers(baseHeaders)
    headers.set('authorization', `Bearer ${token}`)
    const init: ProxyRequestInit = {
      method: request.method,
      headers,
      redirect: 'manual',
      body: bufferedBody,
      duplex: 'half',
      signal,
      bypassCustomProtocolHandlers: true
    }
    return net.fetch(target, init)
  }

  try {
    const response = await send(initialToken)

    if (response.status === 403) {
      if ((await readErrorCode(response)) === 'PASSWORD_CHANGE_REQUIRED') auth.markPasswordChangeRequired()
      return response
    }

    if (response.status !== 401 || (await readErrorCode(response)) !== 'TOKEN_EXPIRED') return response

    let retryToken: string
    try {
      const currentToken = await auth.getAccessToken(0)
      retryToken = currentToken !== null && currentToken !== initialToken ? currentToken : (await auth.refresh()).value
    } catch {
      return response
    }
    return await send(retryToken)
  } catch (error) {
    // URL and reason stay in main, the renderer gets a generic message
    console.error(`[cc-api] backend is unreachable (${backendUrl}):`, error)
    return jsonError(502, 'Backend is unreachable')
  }
}

// Must be called after app.whenReady
export function install(backendUrl: string, auth: ProxyAuthPort): void {
  protocol.handle(SCHEME, (request) => forward(request, backendUrl, auth))
}
