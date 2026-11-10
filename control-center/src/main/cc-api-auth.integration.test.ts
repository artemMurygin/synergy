import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  net: { fetch: (url: string, init: RequestInit) => fetch(url, init) },
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() }
}))

import { forward } from './cc-api-protocol'
import type { AuthService } from './auth/application/auth-service'
import { createAuthService } from './auth/auth-composition'
import type { TokenVaultPort } from './auth/application/token-vault.port'
import type { RefreshToken } from './auth/domain/refresh-token'

const FAR_FUTURE_EXP_SEC = 4_102_444_800
const STREAM_CHUNK_COUNT = 3
const STREAM_PAUSE_MS = 150

function createJwt(subject: string): string {
  const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode({ sub: subject, exp: FAR_FUTURE_EXP_SEC })}.signature`
}

function createMemoryVault(): TokenVaultPort {
  let stored: RefreshToken | null = null
  return {
    save: async (token) => {
      stored = token
      return { persisted: true }
    },
    load: async () => stored,
    clear: async () => {
      stored = null
    }
  }
}

interface RecordedRequest {
  method: string
  path: string
  authorization: string | undefined
}

interface FakeBackend {
  baseUrl: string
  requests: RecordedRequest[]
  countOf(path: string): number
  expireAccessTokens(parallelHits?: number): void
  delayExpiredResponses(delaysMs: number[]): void
  close(): Promise<void>
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

async function readBody(request: IncomingMessage): Promise<void> {
  for await (const chunk of request) void chunk
}

async function startBackend(): Promise<FakeBackend> {
  const requests: RecordedRequest[] = []
  let generation = 1
  let expiredAccessTokens = new Set<string>()
  let expectedExpiredHits = 1
  let pendingExpired: ServerResponse[] = []
  let expiredResponseDelaysMs: number[] = []
  let expiredHitCount = 0
  const issue = (): { accessToken: string; refreshToken: string; mustChangePassword: boolean } => ({
    accessToken: createJwt(`access-${generation}`),
    refreshToken: `refresh-${generation}`,
    mustChangePassword: false
  })

  const server: Server = createServer(async (request, response) => {
    await readBody(request)
    const path = request.url ?? ''
    const authorization = request.headers.authorization
    requests.push({ method: request.method ?? '', path, authorization })
    const isExpired = authorization !== undefined && expiredAccessTokens.has(authorization.slice('Bearer '.length))

    if (path === '/auth/login') return sendJson(response, 200, issue())
    if (path === '/auth/refresh') {
      generation += 1
      return sendJson(response, 200, issue())
    }
    if (path === '/auth/me') return sendJson(response, 200, { id: 'user-1', login: 'admin' })
    if (authorization === undefined || isExpired) {
      if (expiredResponseDelaysMs.length > 0) {
        const delayMs = expiredResponseDelaysMs[expiredHitCount] ?? 0
        expiredHitCount += 1
        setTimeout(() => sendJson(response, 401, { code: 'TOKEN_EXPIRED' }), delayMs)
        return
      }
      pendingExpired.push(response)
      if (pendingExpired.length < expectedExpiredHits) return
      const waiting = pendingExpired
      pendingExpired = []
      for (const entry of waiting) sendJson(entry, 401, { code: 'TOKEN_EXPIRED' })
      return
    }
    if (path === '/threads') return sendJson(response, 200, [{ id: 'thread-1' }])
    if (path === '/agent') {
      response.writeHead(200, { 'content-type': 'text/plain' })
      for (let index = 0; index < STREAM_CHUNK_COUNT; index += 1) {
        response.write(`chunk-${index}\n`)
        await new Promise((resolve) => setTimeout(resolve, STREAM_PAUSE_MS))
      }
      return response.end()
    }
    return sendJson(response, 404, {})
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Server has no TCP address')
  const { port } = address

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    countOf: (path) => requests.filter((entry) => entry.path === path).length,
    expireAccessTokens: (parallelHits = 1) => {
      expectedExpiredHits = parallelHits
      expiredAccessTokens = new Set([createJwt(`access-${generation}`)])
    },
    delayExpiredResponses: (delaysMs) => {
      expiredResponseDelaysMs = delaysMs
      expiredHitCount = 0
      expiredAccessTokens = new Set([createJwt(`access-${generation}`)])
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
  }
}

const proxyRequest = (path: string, init?: RequestInit): Request => new Request(`cc-api://backend${path}`, init)

describe('cc-api proxy with real auth stack', () => {
  let backend: FakeBackend
  let auth: AuthService

  beforeEach(async () => {
    backend = await startBackend()
    auth = createAuthService({
      backendUrl: backend.baseUrl,
      fetchFn: (url, init) => fetch(url, init),
      vault: createMemoryVault()
    })
    await auth.login('admin', 'secret')
  })

  afterEach(async () => {
    await backend.close()
  })

  it('sends the bearer token obtained at login with /threads', async () => {
    const response = await forward(proxyRequest('/threads'), backend.baseUrl, auth)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([{ id: 'thread-1' }])
    const threadsRequest = backend.requests.find((entry) => entry.path === '/threads')
    expect(threadsRequest?.authorization).toBe(`Bearer ${createJwt('access-1')}`)
  })

  it('performs exactly one refresh for three parallel requests with an expired token', async () => {
    backend.expireAccessTokens(3)

    const responses = await Promise.all([
      forward(proxyRequest('/threads'), backend.baseUrl, auth),
      forward(proxyRequest('/threads'), backend.baseUrl, auth),
      forward(proxyRequest('/threads'), backend.baseUrl, auth)
    ])

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200])
    expect(backend.countOf('/auth/refresh')).toBe(1)
    const successfulRetries = backend.requests.filter(
      (entry) => entry.path === '/threads' && entry.authorization === `Bearer ${createJwt('access-2')}`
    )
    expect(successfulRetries).toHaveLength(3)
  })

  it('performs exactly one refresh when a 401 arrives after the first refresh has finished', async () => {
    backend.delayExpiredResponses([0, 400, 800])

    const responses = await Promise.all([
      forward(proxyRequest('/threads'), backend.baseUrl, auth),
      forward(proxyRequest('/threads'), backend.baseUrl, auth),
      forward(proxyRequest('/threads'), backend.baseUrl, auth)
    ])

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200])
    expect(backend.countOf('/auth/refresh')).toBe(1)
    const successfulRetries = backend.requests.filter(
      (entry) => entry.path === '/threads' && entry.authorization === `Bearer ${createJwt('access-2')}`
    )
    expect(successfulRetries).toHaveLength(3)
  })

  it('delivers the /agent stream in chunks before the response completes', async () => {
    const startedAt = Date.now()
    const response = await forward(proxyRequest('/agent', { method: 'POST', body: '{}' }), backend.baseUrl, auth)
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Response has no body')

    const first = await reader.read()
    const firstChunkElapsedMs = Date.now() - startedAt
    let received = new TextDecoder().decode(first.value)
    for (let result = await reader.read(); !result.done; result = await reader.read()) {
      received += new TextDecoder().decode(result.value)
    }
    const totalElapsedMs = Date.now() - startedAt

    expect(received).toContain('chunk-0')
    expect(received).toContain('chunk-2')
    expect(firstChunkElapsedMs).toBeLessThan(STREAM_PAUSE_MS * 2)
    expect(totalElapsedMs).toBeGreaterThanOrEqual(STREAM_PAUSE_MS * STREAM_CHUNK_COUNT - 50)
  })

  it('retries /agent exactly once after 401 TOKEN_EXPIRED', async () => {
    backend.expireAccessTokens()

    const response = await forward(proxyRequest('/agent', { method: 'POST', body: '{}' }), backend.baseUrl, auth)
    await response.text()

    expect(response.status).toBe(200)
    expect(backend.countOf('/auth/refresh')).toBe(1)
    expect(backend.requests.filter((entry) => entry.path === '/agent')).toHaveLength(2)
  })
})
