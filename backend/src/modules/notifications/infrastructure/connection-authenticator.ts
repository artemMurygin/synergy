import { Injectable } from '@nestjs/common';
import { AccessTokenExpiredError, AccessTokenInvalidError } from '../../auth/domain/errors';
import { AccessTokenService } from '../../auth/domain/ports/access-token-service.port';
import {
    type AuthenticatedConnection,
    ConnectionAuthenticatorPort,
    ConnectionRejectedError,
} from '../application/ports/connection-authenticator.port';

const MS_IN_SECOND = 1000;

@Injectable()
export class ConnectionAuthenticator extends ConnectionAuthenticatorPort {
    constructor(private readonly tokens: AccessTokenService) {
        super();
    }

    authenticate(token: string): AuthenticatedConnection {
        if (token.length === 0) throw new ConnectionRejectedError('token_invalid');
        const claims = this.verify(token);
        if (claims.mcp) throw new ConnectionRejectedError('password_change_required');
        return { userId: claims.sub, expiresAt: new Date(claims.exp * MS_IN_SECOND) };
    }

    private verify(token: string): ReturnType<AccessTokenService['verify']> {
        try {
            return this.tokens.verify(token);
        } catch (error: unknown) {
            if (error instanceof AccessTokenExpiredError) {
                throw new ConnectionRejectedError('token_expired');
            }
            if (error instanceof AccessTokenInvalidError) {
                throw new ConnectionRejectedError('token_invalid');
            }
            throw error;
        }
    }
}
