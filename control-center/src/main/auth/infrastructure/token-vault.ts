import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { TokenVaultPort } from '../application/token-vault.port'
import { RefreshToken } from '../domain/refresh-token'

const WEAK_STORAGE_BACKEND = 'basic_text'
const OWNER_ONLY_FILE_MODE = 0o600

export interface SafeStoragePort {
  isEncryptionAvailable(): boolean
  getSelectedStorageBackend?(): string | undefined
  encryptString(plain: string): Buffer
  decryptString(encrypted: Buffer): string
}

export class TokenVault implements TokenVaultPort {
  constructor(
    private readonly safeStorage: SafeStoragePort,
    private readonly filePath: string
  ) {}

  async save(token: RefreshToken): Promise<{ persisted: boolean }> {
    if (!this.canEncrypt()) {
      await this.clear()
      return { persisted: false }
    }
    const temporaryPath = `${this.filePath}.tmp`
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(temporaryPath, this.safeStorage.encryptString(token.value), { mode: OWNER_ONLY_FILE_MODE })
    await rename(temporaryPath, this.filePath)
    return { persisted: true }
  }

  async load(): Promise<RefreshToken | null> {
    if (!this.canEncrypt()) return null
    let encrypted: Buffer
    try {
      encrypted = await readFile(this.filePath)
    } catch {
      return null
    }
    try {
      return RefreshToken.of(this.safeStorage.decryptString(encrypted))
    } catch {
      await this.clear()
      return null
    }
  }

  async clear(): Promise<void> {
    await rm(this.filePath, { force: true })
  }

  private canEncrypt(): boolean {
    if (!this.safeStorage.isEncryptionAvailable()) return false
    return this.safeStorage.getSelectedStorageBackend?.() !== WEAK_STORAGE_BACKEND
  }
}
