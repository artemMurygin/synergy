import { JwtService } from '@nestjs/jwt';
import {
    DownloadTokenPort,
    type DownloadTokenSigned,
} from '../../domain/ports/download-token.port';

export interface DownloadTokenOptions {
    secret: string;
    clock: { now(): Date };
}

const ALGORITHM = 'HS256';
const AUDIENCE = 'file-download';

export class DownloadTokenService extends DownloadTokenPort {
    // Отдельный экземпляр со своим секретом, не общий JwtService из auth.
    private readonly jwt: JwtService;

    constructor(private readonly options: DownloadTokenOptions) {
        super();
        this.jwt = new JwtService({ secret: options.secret });
    }

    sign(fileId: string, ttlSec: number): DownloadTokenSigned {
        const nowSec = Math.floor(this.options.clock.now().getTime() / 1000);
        const exp = nowSec + ttlSec;
        const token = this.jwt.sign(
            { sub: fileId, aud: AUDIENCE, iat: nowSec, exp },
            { algorithm: ALGORITHM },
        );
        return { token, expiresAt: new Date(exp * 1000) };
    }

    verify(token: string, fileId: string): boolean {
        try {
            const payload = this.jwt.verify<{ sub?: unknown }>(token, {
                algorithms: [ALGORITHM],
                audience: AUDIENCE,
                clockTimestamp: Math.floor(this.options.clock.now().getTime() / 1000),
            });
            return payload.sub === fileId;
        } catch {
            return false;
        }
    }
}
