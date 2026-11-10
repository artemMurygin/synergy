import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RefreshToken } from '../domain/refresh-token'
import { TokenVault, type SafeStoragePort } from './token-vault'

class FakeSafeStorage implements SafeStoragePort {
  isAvailable = true
  backend: string | undefined = undefined

  isEncryptionAvailable(): boolean {
    return this.isAvailable
  }

  getSelectedStorageBackend(): string | undefined {
    return this.backend
  }

  encryptString(plain: string): Buffer {
    return Buffer.from(`enc:${Buffer.from(plain).toString('hex')}`)
  }

  decryptString(encrypted: Buffer): string {
    const text = encrypted.toString()
    if (!text.startsWith('enc:')) throw new Error('cannot decrypt')
    return Buffer.from(text.slice('enc:'.length), 'hex').toString()
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

describe('TokenVault', () => {
  let directory: string
  let filePath: string
  let safeStorage: FakeSafeStorage
  let vault: TokenVault

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'token-vault-'))
    filePath = join(directory, 'refresh-token.bin')
    safeStorage = new FakeSafeStorage()
    vault = new TokenVault(safeStorage, filePath)
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('encrypts the token before writing it to disk', async () => {
    const result = await vault.save(RefreshToken.of('plain-refresh-token'))

    expect(result).toEqual({ persisted: true })
    const onDisk = await readFile(filePath)
    expect(onDisk.toString()).not.toContain('plain-refresh-token')
    expect(onDisk.toString('utf8')).toContain('enc:')
  })

  it('reads the saved token back after decrypting it', async () => {
    await vault.save(RefreshToken.of('plain-refresh-token'))

    const loaded = await new TokenVault(safeStorage, filePath).load()

    expect(loaded?.value).toBe('plain-refresh-token')
  })

  it('replaces the stored token when it is rotated', async () => {
    await vault.save(RefreshToken.of('first'))
    await vault.save(RefreshToken.of('second'))

    expect((await vault.load())?.value).toBe('second')
  })

  it('returns null when nothing was saved', async () => {
    expect(await vault.load()).toBeNull()
  })

  it('returns null and removes a corrupted file', async () => {
    await writeFile(filePath, 'garbage')

    expect(await vault.load()).toBeNull()
    expect(await fileExists(filePath)).toBe(false)
  })

  it('clears the stored token and is idempotent', async () => {
    await vault.save(RefreshToken.of('token'))

    await vault.clear()
    await vault.clear()

    expect(await fileExists(filePath)).toBe(false)
    expect(await vault.load()).toBeNull()
  })

  it('does not write anything when OS encryption is unavailable', async () => {
    safeStorage.isAvailable = false

    const result = await vault.save(RefreshToken.of('token'))

    expect(result).toEqual({ persisted: false })
    expect(await fileExists(filePath)).toBe(false)
    expect(await vault.load()).toBeNull()
  })

  it('does not persist when the storage backend is basic_text', async () => {
    safeStorage.backend = 'basic_text'

    const result = await vault.save(RefreshToken.of('token'))

    expect(result).toEqual({ persisted: false })
    expect(await fileExists(filePath)).toBe(false)
  })

  it('removes a stale file when encryption becomes unavailable', async () => {
    await vault.save(RefreshToken.of('old'))
    safeStorage.isAvailable = false

    const result = await vault.save(RefreshToken.of('new'))

    expect(result).toEqual({ persisted: false })
    expect(await fileExists(filePath)).toBe(false)
  })
})
