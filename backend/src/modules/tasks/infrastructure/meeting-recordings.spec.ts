import { describe, expect, it } from 'vitest';
import { FileNotFoundError } from '../../files/application/errors';
import type { GetFileUseCase } from '../../files/application/get-file.use-case';
import type { StoredFileView } from '../../files/application/stored-file-view';
import { MeetingRecordings } from './meeting-recordings';

function file(kind: StoredFileView['kind']): StoredFileView {
    return {
        id: 'f1',
        name: 'Планёрка.m4a',
        mediaType: 'audio/mp4',
        kind,
        sizeBytes: 10,
        status: 'active',
        awaitingProcessing: false,
        uploadedAt: new Date('2026-01-10T12:00:00Z'),
        expiresAt: null,
        deletedAt: null,
    };
}

function recordings(execute: GetFileUseCase['execute']): MeetingRecordings {
    const getFile: Pick<GetFileUseCase, 'execute'> = { execute };
    return new MeetingRecordings(getFile as GetFileUseCase);
}

describe('MeetingRecordings', () => {
    it('gives the name of a recording of the owner', async () => {
        const lookup = recordings(() => Promise.resolve(file('recording')));
        expect(await lookup.findOwnedRecordingName('me', 'f1')).toBe('Планёрка.m4a');
    });

    it('gives null for a document and for a foreign or missing file', async () => {
        expect(
            await recordings(() => Promise.resolve(file('document'))).findOwnedRecordingName(
                'me',
                'f1',
            ),
        ).toBeNull();
        expect(
            await recordings(() =>
                Promise.reject(new FileNotFoundError('f1')),
            ).findOwnedRecordingName('me', 'f1'),
        ).toBeNull();
    });

    it('does not hide other failures', async () => {
        const lookup = recordings(() => Promise.reject(new Error('db is down')));
        await expect(lookup.findOwnedRecordingName('me', 'f1')).rejects.toThrow('db is down');
    });
});
