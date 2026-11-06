import type { PasswordHash } from '../password-hash';

export abstract class PasswordHasher {
    abstract hash(plain: string): Promise<PasswordHash>;
    abstract verify(hash: PasswordHash, plain: string): Promise<boolean>;
    /** Spends the cost of a real verification; evens out timing for unknown logins. */
    abstract verifyDummy(plain: string): Promise<void>;
}
