import type { NewRefreshToken } from '../refresh-token';

export interface IssuedRefreshToken {
    /** Plain secret; leaves the system only in the response. */
    secret: string;
    token: NewRefreshToken;
}

export abstract class RefreshTokenFactory {
    abstract issue(expiresAt: Date): IssuedRefreshToken;
    abstract hash(secret: string): string;
}
