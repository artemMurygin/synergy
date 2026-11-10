const JWT_PARTS_COUNT = 3

function decodeExpirationSec(raw: string): number {
  const parts = raw.split('.')
  if (parts.length !== JWT_PARTS_COUNT) throw new Error('Access token is not a JWT')
  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    throw new Error('Access token payload is not valid JSON')
  }
  if (typeof payload !== 'object' || payload === null || !('exp' in payload) || typeof payload.exp !== 'number') {
    throw new Error('Access token has no numeric exp claim')
  }
  return payload.exp
}

export class AccessToken {
  private constructor(
    readonly value: string,
    readonly expiresAtMs: number
  ) {}

  static parse(raw: string): AccessToken {
    return new AccessToken(raw, decodeExpirationSec(raw) * 1000)
  }

  expiresWithin(windowMs: number, nowMs: number = Date.now()): boolean {
    return this.expiresAtMs - nowMs < windowMs
  }
}
