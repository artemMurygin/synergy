import { DownloadLinksUnavailableError } from '../application/errors';
import { DownloadTokenPort, type DownloadTokenSigned } from '../domain/ports/download-token.port';
import { DownloadTokenService } from './jwt/download-token.service';

class UnavailableDownloadTokenService extends DownloadTokenPort {
    sign(): DownloadTokenSigned {
        throw new DownloadLinksUnavailableError();
    }

    verify(): boolean {
        return false;
    }
}

export function createDownloadTokenService(
    secret: string | undefined,
    clock: { now(): Date },
): DownloadTokenPort {
    return secret === undefined
        ? new UnavailableDownloadTokenService()
        : new DownloadTokenService({ secret, clock });
}
