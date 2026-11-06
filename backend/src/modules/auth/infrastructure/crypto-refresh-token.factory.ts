import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
    RefreshTokenFactory,
    type IssuedRefreshToken,
} from '../domain/ports/refresh-token-factory.port';

const SECRET_BYTES = 32;

@Injectable()
export class CryptoRefreshTokenFactory extends RefreshTokenFactory {
    issue(expiresAt: Date): IssuedRefreshToken {
        const secret = randomBytes(SECRET_BYTES).toString('base64url');
        return { secret, token: { id: randomUUID(), tokenHash: this.hash(secret), expiresAt } };
    }

    hash(secret: string): string {
        return createHash('sha256').update(secret).digest('hex');
    }
}
