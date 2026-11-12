import { describe, expect, it, vi } from 'vitest';
import { FileNotFoundError } from '../../files/application/errors';
import type { FindOwnedFilesUseCase } from '../../files/application/find-owned-files.use-case';
import type { StoredFileView } from '../../files/application/stored-file-view';
import { FileGoneError } from '../../files/domain/errors';
import {
    ChatAttachmentExpiredError,
    ChatAttachmentNotFoundError,
} from '../domain/chat-attachment.errors';
import { FilesAttachmentLookup } from './files-attachment-lookup';

function view(id: string): StoredFileView {
    return {
        id,
        name: `${id}.m4a`,
        mediaType: 'audio/mp4',
        kind: 'recording',
        sizeBytes: 4096,
        status: 'active',
        awaitingProcessing: true,
        uploadedAt: new Date(),
        expiresAt: null,
        deletedAt: null,
    };
}

function lookup(execute: FindOwnedFilesUseCase['execute']): FilesAttachmentLookup {
    return new FilesAttachmentLookup({ execute } as unknown as FindOwnedFilesUseCase);
}

describe('FilesAttachmentLookup', () => {
    it('turns the owned files into attachment refs in the input order', async () => {
        const execute = vi.fn(({ fileIds }: { fileIds: readonly string[] }) =>
            Promise.resolve(fileIds.map(view)),
        );
        const refs = await lookup(execute).findOwned('u-1', ['f2', 'f1']);
        expect(execute).toHaveBeenCalledWith({ ownerId: 'u-1', fileIds: ['f2', 'f1'] });
        expect(refs.map((r) => r.fileId)).toEqual(['f2', 'f1']);
        expect(refs[0]).toMatchObject({
            name: 'f2.m4a',
            mediaType: 'audio/mp4',
            kind: 'recording',
            sizeBytes: 4096,
        });
    });

    it('turns a missing or foreign file into ChatAttachmentNotFoundError with its id', async () => {
        const failing = lookup(() => Promise.reject(new FileNotFoundError('f9')));
        const error = await failing.findOwned('u-1', ['f9']).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ChatAttachmentNotFoundError);
        expect((error as ChatAttachmentNotFoundError).fileId).toBe('f9');
    });

    it('turns a deleted file into ChatAttachmentExpiredError with its id', async () => {
        const failing = lookup(() => Promise.reject(new FileGoneError('f8')));
        const error = await failing.findOwned('u-1', ['f8']).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ChatAttachmentExpiredError);
        expect((error as ChatAttachmentExpiredError).fileId).toBe('f8');
    });

    it('passes other errors through', async () => {
        const boom = new Error('db down');
        await expect(lookup(() => Promise.reject(boom)).findOwned('u', ['f'])).rejects.toBe(boom);
    });
});
