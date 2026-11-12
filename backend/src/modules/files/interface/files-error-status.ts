import { HttpStatus } from '@nestjs/common';
import { registerErrorStatuses } from '../../../shared/http/error-status.registry';
import { FileApplicationErrorCode } from '../application/errors';
import { FileErrorCode } from '../domain/errors';

export function registerFileErrorStatuses(): void {
    registerErrorStatuses({
        [FileApplicationErrorCode.FileNotFound]: HttpStatus.NOT_FOUND,
        [FileApplicationErrorCode.EmptyFile]: HttpStatus.BAD_REQUEST,
        [FileApplicationErrorCode.InvalidDownloadToken]: HttpStatus.FORBIDDEN,
        [FileErrorCode.FileGone]: HttpStatus.GONE,
        [FileErrorCode.FileTooLarge]: HttpStatus.PAYLOAD_TOO_LARGE,
        [FileErrorCode.UnsupportedMediaType]: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        [FileApplicationErrorCode.DownloadLinksUnavailable]: HttpStatus.SERVICE_UNAVAILABLE,
    });
}
