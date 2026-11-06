import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PasswordHash } from '../domain/password-hash';
import { PasswordHasher } from '../domain/ports/password-hasher.port';

@Injectable()
export class Argon2PasswordHasher extends PasswordHasher {
    private dummyHash: Promise<string> | undefined;

    async hash(plain: string): Promise<PasswordHash> {
        return PasswordHash.of(await argon2.hash(plain, { type: argon2.argon2id }));
    }

    async verify(hash: PasswordHash, plain: string): Promise<boolean> {
        try {
            return await argon2.verify(hash.value, plain);
        } catch {
            return false;
        }
    }

    async verifyDummy(plain: string): Promise<void> {
        this.dummyHash ??= argon2.hash('dummy-password-for-timing', { type: argon2.argon2id });
        await argon2.verify(await this.dummyHash, plain);
    }
}
