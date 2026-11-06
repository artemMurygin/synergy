export interface AccessClaims {
    /** User id. */
    sub: string;
    /** Auth session id. */
    sid: string;
    /** mustChangePassword. */
    mcp: boolean;
    jti: string;
    /** Expiry, seconds since epoch. */
    exp: number;
}
