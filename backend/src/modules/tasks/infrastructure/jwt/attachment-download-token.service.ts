import { JwtService } from '@nestjs/jwt';
import { TaskAttachmentLinksUnavailableError } from '../../domain/errors';
import {
    AttachmentDownloadTokenPort,
    type AttachmentDownloadTokenSigned,
} from '../../domain/ports/attachment-download-token.port';

export interface AttachmentDownloadTokenOptions {
    secret: string;
    clock: { now(): Date };
}

const ALGORITHM = 'HS256';
// Отличается от aud токена файлов чата: токены не взаимозаменяемы даже при общем секрете.
const AUDIENCE = 'task-attachment';

export class JwtAttachmentDownloadToken extends AttachmentDownloadTokenPort {
    private readonly jwt: JwtService;

    constructor(private readonly options: AttachmentDownloadTokenOptions) {
        super();
        this.jwt = new JwtService({ secret: options.secret });
    }

    sign(attachmentId: string, ttlSec: number): AttachmentDownloadTokenSigned {
        const nowSec = Math.floor(this.options.clock.now().getTime() / 1000);
        const exp = nowSec + ttlSec;
        const token = this.jwt.sign(
            { sub: attachmentId, aud: AUDIENCE, iat: nowSec, exp },
            { algorithm: ALGORITHM },
        );
        return { token, expiresAt: new Date(exp * 1000) };
    }

    verify(token: string, attachmentId: string): boolean {
        try {
            const payload = this.jwt.verify<{ sub?: unknown }>(token, {
                algorithms: [ALGORITHM],
                audience: AUDIENCE,
                clockTimestamp: Math.floor(this.options.clock.now().getTime() / 1000),
            });
            return payload.sub === attachmentId;
        } catch {
            return false;
        }
    }
}

class UnavailableAttachmentDownloadToken extends AttachmentDownloadTokenPort {
    sign(): AttachmentDownloadTokenSigned {
        throw new TaskAttachmentLinksUnavailableError();
    }

    verify(): boolean {
        return false;
    }
}

export function createAttachmentDownloadToken(
    secret: string | undefined,
    clock: { now(): Date },
): AttachmentDownloadTokenPort {
    return secret === undefined
        ? new UnavailableAttachmentDownloadToken()
        : new JwtAttachmentDownloadToken({ secret, clock });
}
