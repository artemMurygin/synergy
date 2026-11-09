import { net, protocol } from 'electron'

const SCHEME = 'cc-api'
const HOST = 'backend'
const ALLOWED_PREFIXES = ['/threads', '/agent']
const DROPPED_HEADERS = ['authorization', 'cookie', 'host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-authorization']

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

// Rewrites cc-api://backend/<path> to <backendUrl>/<path> and streams the response back
export async function forward(request: Request, backendUrl: string): Promise<Response> {
  const source = new URL(request.url)
  if (source.hostname !== HOST) return jsonError(400, `Unknown cc-api host: ${source.hostname}`)

  if (!isAllowedPath(source.pathname)) return jsonError(403, 'Path is not allowed')

  const headers = new Headers(request.headers)
  for (const name of DROPPED_HEADERS) headers.delete(name)

  const target = `${backendUrl}${source.pathname}${source.search}`
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  try {
    return await net.fetch(target, {
      method: request.method,
      headers,
      redirect: 'manual',
      body: hasBody ? request.body : undefined,
      duplex: 'half',
      bypassCustomProtocolHandlers: true
    } as RequestInit & { duplex: 'half'; bypassCustomProtocolHandlers: boolean })
  } catch (error) {
    // URL and reason stay in main, the renderer gets a generic message
    console.error(`[cc-api] backend is unreachable (${backendUrl}):`, error)
    return jsonError(502, 'Backend is unreachable')
  }
}

// Must be called after app.whenReady
export function install(backendUrl: string): void {
  protocol.handle(SCHEME, (request) => forward(request, backendUrl))
}
