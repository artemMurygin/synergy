import type { Role } from './role';

export interface AccessClaims {
    /** User id. */
    sub: string;
    /** Auth session id. */
    sid: string;
    /** mustChangePassword. */
    mcp: boolean;
    /** Roles at issue time. Always an array after verify(); absent in legacy tokens. */
    rol: Role[];
    jti: string;
    /** Expiry, seconds since epoch. */
    exp: number;
}
