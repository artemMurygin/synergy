export interface DownloadTokenSigned {
    token: string;
    expiresAt: Date;
}

export abstract class DownloadTokenPort {
    abstract sign(fileId: string, ttlSec: number): DownloadTokenSigned;
    /** false для просроченного, чужого или подделанного токена. */
    abstract verify(token: string, fileId: string): boolean;
}
