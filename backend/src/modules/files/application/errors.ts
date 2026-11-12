import { BaseError } from '../../../shared/errors';

export const FileApplicationErrorCode = {
    FileNotFound: 'FILE_NOT_FOUND',
    EmptyFile: 'FILE_EMPTY',
    InvalidDownloadToken: 'FILE_DOWNLOAD_TOKEN_INVALID',
    DownloadLinksUnavailable: 'FILE_DOWNLOAD_LINKS_UNAVAILABLE',
} as const;

/** Файла нет или он чужой: ответ одинаковый, чтобы не раскрывать существование. */
export class FileNotFoundError extends BaseError {
    readonly code = FileApplicationErrorCode.FileNotFound;

    constructor(readonly fileId: string) {
        super(`File ${fileId} not found`);
    }
}

export class EmptyFileError extends BaseError {
    readonly code = FileApplicationErrorCode.EmptyFile;

    constructor() {
        super('File is empty');
    }
}

export class InvalidDownloadTokenError extends BaseError {
    readonly code = FileApplicationErrorCode.InvalidDownloadToken;

    constructor() {
        super('Download token is invalid');
    }
}

/** Секрет ссылок не задан: выдача ссылок выключена. */
export class DownloadLinksUnavailableError extends BaseError {
    readonly code = FileApplicationErrorCode.DownloadLinksUnavailable;

    constructor() {
        super('Download links are not configured');
    }
}
