import { describe, expect, it } from 'vitest';
import { recordingFiles, storeGeneratedFileDouble } from '../../testing/meeting-document-doubles';
import { MeetingFiles } from './meeting-files';

const UPLOADED_AT = new Date('2026-11-12T07:00:00Z');

function setup(): {
    adapter: MeetingFiles;
    recordings: ReturnType<typeof recordingFiles>;
    store: ReturnType<typeof storeGeneratedFileDouble>;
} {
    const recordings = recordingFiles();
    const store = storeGeneratedFileDouble();
    return { adapter: new MeetingFiles(recordings.getFile, store.store), recordings, store };
}

describe('MeetingFiles', () => {
    it('describes a stored recording of the owner', async () => {
        const { adapter, recordings } = setup();
        recordings.addRecording({
            id: 'rec-1',
            ownerId: 'u-1',
            name: 'встреча.m4a',
            uploadedAt: UPLOADED_AT,
        });

        expect(await adapter.findFile('u-1', 'rec-1')).toEqual({
            name: 'встреча.m4a',
            uploadedAt: UPLOADED_AT,
            isRecording: true,
            isStored: true,
        });
    });

    it('keeps describing a deleted recording as not stored', async () => {
        const { adapter, recordings } = setup();
        const file = recordings.addRecording({
            id: 'rec-1',
            ownerId: 'u-1',
            name: 'встреча.m4a',
            uploadedAt: UPLOADED_AT,
        });
        file.markDeleted(new Date('2026-11-13T07:00:00Z'), 'owner');

        expect(await adapter.findFile('u-1', 'rec-1')).toMatchObject({ isStored: false });
    });

    it('gives null for a foreign or missing file', async () => {
        const { adapter, recordings } = setup();
        recordings.addRecording({
            id: 'rec-1',
            ownerId: 'u-1',
            name: 'встреча.m4a',
            uploadedAt: UPLOADED_AT,
        });

        expect(await adapter.findFile('u-2', 'rec-1')).toBeNull();
        expect(await adapter.findFile('u-1', 'missing')).toBeNull();
    });

    it('stores a document as a generated file of the owner', async () => {
        const { adapter, store } = setup();
        const buffer = Buffer.from('docx');

        const file = await adapter.storeDocument({
            ownerId: 'u-1',
            name: 'Расшифровка — встреча.docx',
            mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            buffer,
        });

        expect(store.calls).toEqual([
            {
                ownerId: 'u-1',
                name: 'Расшифровка — встреча.docx',
                mediaType:
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                buffer,
            },
        ]);
        expect(file).toEqual({
            id: 'generated-1',
            name: 'Расшифровка — встреча.docx',
            mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            sizeBytes: 4,
        });
    });
});
