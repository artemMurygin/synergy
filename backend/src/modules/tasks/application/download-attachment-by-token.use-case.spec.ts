import { Readable } from 'node:stream';
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttachmentNotFoundError, TaskAttachmentTokenInvalidError } from '../domain/errors';
import { FileName } from '../domain/file-name';
import type { AttachmentDownloadTokenPort } from '../domain/ports/attachment-download-token.port';
import { TaskAttachment } from '../domain/task-attachment';
import { DownloadAttachmentByTokenUseCase } from './download-attachment-by-token.use-case';
import { InMemoryAttachmentRepository, InMemoryFileStorage, NOW } from './test-doubles';

let attachments: InMemoryAttachmentRepository;
let storage: InMemoryFileStorage;
let verify: ReturnType<typeof vi.fn>;

const useCase = (): DownloadAttachmentByTokenUseCase =>
    new DownloadAttachmentByTokenUseCase(attachments, storage, {
        sign: vi.fn(),
        verify,
    } as unknown as AttachmentDownloadTokenPort);

beforeEach(async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    attachments = new InMemoryAttachmentRepository();
    storage = new InMemoryFileStorage();
    verify = vi.fn(() => true);
    const { storageKey } = await storage.save(Readable.from([Buffer.from('abc')]), {
        maxBytes: 1024,
    });
    await attachments.insert(
        TaskAttachment.create({
            id: 'a1',
            taskId: 't1',
            originalName: FileName.of('doc.pdf'),
            storageKey,
            sizeBytes: 3,
            contentType: 'application/pdf',
            uploadedBy: 'anna',
            createdAt: NOW,
        }),
    );
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('DownloadAttachmentByTokenUseCase', () => {
    it('returns metadata and the stream for a valid token', async () => {
        const { meta, stream } = await useCase().execute('t1', 'a1', 'tok');

        expect(verify).toHaveBeenCalledWith('tok', 'a1');
        expect(meta).toMatchObject({ id: 'a1', originalName: 'doc.pdf' });
        expect((await stream.toArray()).toString()).toBe('abc');
    });

    it('403 for an invalid token, before looking at the attachment', async () => {
        verify.mockReturnValue(false);
        await expect(useCase().execute('missing', 'zz', 'bad')).rejects.toBeInstanceOf(
            TaskAttachmentTokenInvalidError,
        );
    });

    it('404 when the attachment is gone or from another task', async () => {
        await expect(useCase().execute('t1', 'zz', 'tok')).rejects.toBeInstanceOf(
            AttachmentNotFoundError,
        );
        verify.mockReturnValue(true);
        await expect(useCase().execute('t2', 'a1', 'tok')).rejects.toBeInstanceOf(
            AttachmentNotFoundError,
        );
    });

    it('404 when the file is missing in storage', async () => {
        storage.files.clear();
        await expect(useCase().execute('t1', 'a1', 'tok')).rejects.toBeInstanceOf(
            AttachmentNotFoundError,
        );
    });
});
