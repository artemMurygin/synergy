import { ApiProperty } from '@nestjs/swagger';
import type { DownloadLink } from '../../application/create-download-link.use-case';
import type { StoredFileView } from '../../application/stored-file-view';
import { FILE_KINDS, type FileKind } from '../../domain/file-kind';
import { STORED_FILE_STATUSES, type StoredFileStatus } from '../../domain/stored-file';

const UUID_EXAMPLE = '2cdc8ab1-6d50-49cc-ba14-54e4ac7ec231';

export class StoredFileResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id: string;

    @ApiProperty({ example: 'Отчёт.xlsx' })
    readonly name: string;

    @ApiProperty({ example: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    readonly mediaType: string;

    @ApiProperty({ enum: FILE_KINDS })
    readonly kind: FileKind;

    @ApiProperty({ example: 2097152 })
    readonly sizeBytes: number;

    @ApiProperty({ enum: STORED_FILE_STATUSES })
    readonly status: StoredFileStatus;

    @ApiProperty({ description: 'The recording waits for processing; expiresAt is not set yet' })
    readonly awaitingProcessing: boolean;

    @ApiProperty({ example: '2026-11-06T10:00:00.000Z' })
    readonly uploadedAt: string;

    @ApiProperty({
        type: String,
        nullable: true,
        example: '2026-12-06T10:00:00.000Z',
        description: 'null while the recording is held and for a deleted file',
    })
    readonly expiresAt: string | null;

    @ApiProperty({ type: String, nullable: true, example: null })
    readonly deletedAt: string | null;

    constructor(view: StoredFileView) {
        this.id = view.id;
        this.name = view.name;
        this.mediaType = view.mediaType;
        this.kind = view.kind;
        this.sizeBytes = view.sizeBytes;
        this.status = view.status;
        this.awaitingProcessing = view.awaitingProcessing;
        this.uploadedAt = view.uploadedAt.toISOString();
        this.expiresAt = view.expiresAt?.toISOString() ?? null;
        this.deletedAt = view.deletedAt?.toISOString() ?? null;
    }
}

export class DownloadLinkResponse {
    @ApiProperty({
        example: `/files/${UUID_EXAMPLE}/content?token=eyJhbGciOiJIUzI1NiJ9...`,
        description: 'Relative URL that works without the Authorization header',
    })
    readonly url: string;

    @ApiProperty({ example: '2026-11-06T10:05:00.000Z' })
    readonly expiresAt: string;

    constructor(link: DownloadLink) {
        this.url = link.url;
        this.expiresAt = link.expiresAt.toISOString();
    }
}

export class FileUploadBody {
    @ApiProperty({ type: 'string', format: 'binary', description: 'The file to upload' })
    readonly file?: unknown;
}
