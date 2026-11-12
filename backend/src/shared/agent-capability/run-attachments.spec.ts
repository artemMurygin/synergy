import { describe, expect, it, vi } from 'vitest';
import { AttachmentRef } from './attachment-ref';
import { RunAttachments } from './run-attachments';

function file(fileId: string): AttachmentRef {
    return AttachmentRef.of({
        fileId,
        name: `${fileId}.docx`,
        mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        kind: 'document',
        sizeBytes: 100,
    });
}

describe('RunAttachments', () => {
    it('is empty when created', () => {
        expect(RunAttachments.create().list()).toEqual([]);
    });

    it('lists files in the order of adding, without duplicates by file id', () => {
        const attachments = RunAttachments.create();
        attachments.add(file('b'));
        attachments.add(file('a'));
        attachments.add(file('b'));
        expect(attachments.list().map((f) => f.fileId)).toEqual(['b', 'a']);
    });

    it('notifies the subscriber once for every new file', () => {
        const attachments = RunAttachments.create();
        const listener = vi.fn();
        attachments.subscribe(listener);
        attachments.add(file('a'));
        attachments.add(file('a'));
        attachments.add(file('b'));
        expect(listener.mock.calls.map(([f]) => (f as AttachmentRef).fileId)).toEqual(['a', 'b']);
    });

    it('stops notifying after unsubscribe', () => {
        const attachments = RunAttachments.create();
        const listener = vi.fn();
        const unsubscribe = attachments.subscribe(listener);
        unsubscribe();
        attachments.add(file('a'));
        expect(listener).not.toHaveBeenCalled();
        expect(attachments.list()).toHaveLength(1);
    });

    it('returns a copy of the list', () => {
        const attachments = RunAttachments.create();
        attachments.add(file('a'));
        const listed = attachments.list() as AttachmentRef[];
        listed.push(file('x'));
        expect(attachments.list()).toHaveLength(1);
    });
});
