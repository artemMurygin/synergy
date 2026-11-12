import { AggregateRoot } from '../../../shared/ddd';
import { FileGoneError, InvalidStoredFileError } from './errors';
import { FileDeletedEvent, type FileDeletionCause } from './events/file-deleted.event';
import { FileUploadedEvent } from './events/file-uploaded.event';
import type { FileKind } from './file-kind';
import type { FileName } from './file-name';
import type { MediaType } from './media-type';
import type { Retention } from './retention';
import type { RetentionPolicy } from './retention-policy';

export const STORED_FILE_STATUSES = ['active', 'deleted'] as const;

export type StoredFileStatus = (typeof STORED_FILE_STATUSES)[number];

export interface StoredFileProps {
    ownerId: string;
    name: FileName;
    mediaType: MediaType;
    sizeBytes: number;
    storageKey: string;
    status: StoredFileStatus;
    retention: Retention;
    uploadedAt: Date;
    deletedAt: Date | null;
}

export interface UploadStoredFileInput {
    id: string;
    ownerId: string;
    name: FileName;
    mediaType: MediaType;
    sizeBytes: number;
    storageKey: string;
    now: Date;
}

export interface RestoreStoredFileInput extends StoredFileProps {
    id: string;
    createdAt: Date;
    updatedAt: Date;
}

/** Файл пользователя в объектном хранилище. Строка не удаляется, только `status = deleted`. */
export class StoredFile extends AggregateRoot<StoredFileProps> {
    static upload(input: UploadStoredFileInput, policy: RetentionPolicy): StoredFile {
        const file = new StoredFile({
            id: input.id,
            createdAt: input.now,
            updatedAt: input.now,
            props: {
                ownerId: input.ownerId,
                name: input.name,
                mediaType: input.mediaType,
                sizeBytes: input.sizeBytes,
                storageKey: input.storageKey,
                status: 'active',
                retention: policy.initial(input.mediaType.kind, input.now),
                uploadedAt: input.now,
                deletedAt: null,
            },
        });
        file.addEvent(
            new FileUploadedEvent({
                aggregateId: file.id,
                ownerId: file.ownerId,
                kind: file.kind,
                mediaType: file.mediaType.mime,
                sizeBytes: file.sizeBytes,
                metadata: { timestamp: input.now.getTime(), userId: file.ownerId },
            }),
        );
        return file;
    }

    static restore({ id, createdAt, updatedAt, ...props }: RestoreStoredFileInput): StoredFile {
        return new StoredFile({ id, createdAt, updatedAt, props: { ...props } });
    }

    get ownerId(): string {
        return this.props.ownerId;
    }

    get name(): FileName {
        return this.props.name;
    }

    get mediaType(): MediaType {
        return this.props.mediaType;
    }

    get kind(): FileKind {
        return this.props.mediaType.kind;
    }

    get sizeBytes(): number {
        return this.props.sizeBytes;
    }

    get storageKey(): string {
        return this.props.storageKey;
    }

    get status(): StoredFileStatus {
        return this.props.status;
    }

    get retention(): Retention {
        return this.props.retention;
    }

    get uploadedAt(): Date {
        return this.props.uploadedAt;
    }

    get deletedAt(): Date | null {
        return this.props.deletedAt;
    }

    isDeleted(): boolean {
        return this.props.status === 'deleted';
    }

    isAwaitingProcessing(): boolean {
        return !this.isDeleted() && this.props.retention.isHeld();
    }

    /** Повторный вызов, документ и удалённый файл — ничего не меняют. */
    releaseHold(now: Date, policy: RetentionPolicy): void {
        if (this.isDeleted() || !this.props.retention.isHeld()) return;
        this.props.retention = policy.released(now);
        this.touch();
    }

    hold(now: Date, policy: RetentionPolicy): void {
        if (this.isDeleted()) throw new FileGoneError(this.id);
        if (this.kind !== 'recording') {
            throw new InvalidStoredFileError('Only a recording can be held');
        }
        this.props.retention = policy.held(now);
        this.touch();
    }

    isExpired(now: Date, policy: RetentionPolicy): boolean {
        if (this.isDeleted()) return false;
        return policy.effectiveExpiry(this.props.retention).getTime() <= now.getTime();
    }

    markDeleted(now: Date, cause: FileDeletionCause): void {
        if (this.isDeleted()) return;
        this.props.status = 'deleted';
        this.props.deletedAt = now;
        this.touch();
        this.addEvent(
            new FileDeletedEvent({
                aggregateId: this.id,
                ownerId: this.ownerId,
                kind: this.kind,
                cause,
                metadata: { timestamp: now.getTime(), userId: this.ownerId },
            }),
        );
    }

    validate(): void {
        const { ownerId, storageKey, sizeBytes, status, deletedAt, retention } = this.props;
        if (ownerId.length === 0) throw new InvalidStoredFileError('ownerId must not be empty');
        if (storageKey.length === 0) {
            throw new InvalidStoredFileError('storageKey must not be empty');
        }
        if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
            throw new InvalidStoredFileError('sizeBytes must be a positive integer');
        }
        if (!STORED_FILE_STATUSES.includes(status)) {
            throw new InvalidStoredFileError('Unknown file status');
        }
        if ((status === 'deleted') !== (deletedAt !== null)) {
            throw new InvalidStoredFileError(
                'deletedAt must be set exactly when status is deleted',
            );
        }
        if (status === 'active' && this.kind === 'document' && retention.expiresAt === null) {
            throw new InvalidStoredFileError('An active document must have an expiry');
        }
    }
}
