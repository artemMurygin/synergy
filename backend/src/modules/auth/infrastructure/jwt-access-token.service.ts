import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AccessClaims } from '../domain/access-claims';
import { AccessTokenExpiredError, AccessTokenInvalidError } from '../domain/errors';
import {
    AccessTokenService,
    type AccessTokenSigned,
} from '../domain/ports/access-token-service.port';
import type { Clock } from '../domain/ports/clock.port';

export interface JwtAccessTokenOptions {
    secret: string;
    ttlSeconds: number;
    clock: Pick<Clock, 'now'>;
}

const ALGORITHM = 'HS256';

@Injectable()
export class JwtAccessTokenService extends AccessTokenService {
    private readonly jwt: JwtService;

    constructor(private readonly options: JwtAccessTokenOptions) {
        super();
        this.jwt = new JwtService({ secret: options.secret });
    }

    sign(claims: Pick<AccessClaims, 'sub' | 'sid' | 'mcp'>): AccessTokenSigned {
        const exp = Math.floor(this.options.clock.now().getTime() / 1000) + this.options.ttlSeconds;
        const payload: AccessClaims = {
            sub: claims.sub,
            sid: claims.sid,
            mcp: claims.mcp,
            jti: randomUUID(),
            exp,
        };
        return {
            token: this.jwt.sign(payload, { algorithm: ALGORITHM }),
            expiresIn: this.options.ttlSeconds,
        };
    }

    verify(token: string): AccessClaims {
        let decoded: Partial<AccessClaims>;
        try {
            decoded = this.jwt.verify<Partial<AccessClaims>>(token, { algorithms: [ALGORITHM] });
        } catch (error) {
            if ((error as { name?: string }).name === 'TokenExpiredError') {
                throw new AccessTokenExpiredError();
            }
            throw new AccessTokenInvalidError();
        }
        const { sub, sid, mcp, jti, exp } = decoded;
        if (
            typeof sub !== 'string' ||
            typeof sid !== 'string' ||
            typeof mcp !== 'boolean' ||
            typeof jti !== 'string' ||
            typeof exp !== 'number'
        ) {
            throw new AccessTokenInvalidError();
        }
        return { sub, sid, mcp, jti, exp };
    }
}
