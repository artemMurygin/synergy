import type { AccessClaims } from '../access-claims';
import type { Role } from '../role';

export interface AccessTokenSigned {
    token: string;
    /** Lifetime in seconds. */
    expiresIn: number;
}

export abstract class AccessTokenService {
    /** Fills `jti` and `exp` itself. */
    abstract sign(
        claims: Pick<AccessClaims, 'sub' | 'sid' | 'mcp'> & { rol?: Role[] },
    ): AccessTokenSigned;
    abstract verify(token: string): AccessClaims;
}
