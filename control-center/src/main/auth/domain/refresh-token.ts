const REDACTED = '[redacted]'

export class RefreshToken {
  private constructor(private readonly secret: string) {}

  static of(secret: string): RefreshToken {
    if (secret.length === 0) throw new Error('Refresh token must not be empty')
    return new RefreshToken(secret)
  }

  get value(): string {
    return this.secret
  }

  toString(): string {
    return REDACTED
  }

  toJSON(): string {
    return REDACTED
  }
}
