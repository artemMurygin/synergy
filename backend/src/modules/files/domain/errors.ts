import { ArgumentInvalidError, BaseError } from '../../../shared/errors';

export const FileErrorCode = {
    FileGone: 'FILE_GONE',
    UnsupportedMediaType: 'FILE_UNSUPPORTED_MEDIA_TYPE',
    FileTooLarge: 'FILE_TOO_LARGE',
} as const;

export class InvalidFileNameError extends ArgumentInvalidError {}
export class InvalidRetentionError extends ArgumentInvalidError {}
export class InvalidStoredFileError extends ArgumentInvalidError {}

export class FileGoneError extends BaseError {
    readonly code = FileErrorCode.FileGone;

    constructor(readonly fileId: string) {
        super(`File ${fileId} is deleted`);
    }
}

export class UnsupportedMediaTypeError extends BaseError {
    readonly code = FileErrorCode.UnsupportedMediaType;

    constructor(readonly mime: string | null) {
        super('Unsupported media type');
    }
}

export class FileTooLargeError extends BaseError {
    readonly code = FileErrorCode.FileTooLarge;

    constructor(readonly maxBytes: number) {
        super(`File is larger than ${String(maxBytes)} bytes`);
    }
}
