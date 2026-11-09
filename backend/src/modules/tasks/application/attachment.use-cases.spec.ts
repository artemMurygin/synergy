import { Readable } from 'node:stream';
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { Actor } from '../domain/actor';
import { TaskAccessDeniedError } from '../domain/access-denied.error';
import {
    AttachmentLimitReachedError,
    AttachmentNotFoundError,
    AttachmentTooLargeError,
    TaskNotFoundError,
} from '../domain/errors';
import { FileName } from '../domain/file-name';
import { Task } from '../domain/task';
import { TaskAttachment } from '../domain/task-attachment';
import { TaskTitle } from '../domain/task-title';
import { DeleteAttachmentUseCase } from './delete-attachment.use-case';
import { DownloadAttachmentUseCase } from './download-attachment.use-case';
import {
    FakeAccessPolicy,
    FakeTasksSettings,
    InMemoryAttachmentRepository,
    InMemoryFileStorage,
    InMemoryTaskRepository,
    NOW,
    fakeClock,
} from './test-doubles';
import { UploadAttachmentUseCase, type UploadedFile } from './upload-attachment.use-case';

const me = Actor.of('me');

let tasks: InMemoryTaskRepository;
let attachments: InMemoryAttachmentRepository;
let storage: InMemoryFileStorage;
let settings: FakeTasksSettings;
let policy: FakeAccessPolicy;
let logError: MockInstance<(message: unknown) => void>;

beforeEach(async (): Promise<void> => {
    logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    tasks = new InMemoryTaskRepository();
    attachments = new InMemoryAttachmentRepository();
    storage = new InMemoryFileStorage();
    settings = new FakeTasksSettings();
    policy = new FakeAccessPolicy();
    await tasks.save(
        Task.create({
            id: 't1',
            title: TaskTitle.of('Отчёт'),
            creatorId: 'anna',
            now: new Date('2026-01-01T00:00:00Z'),
        }),
    );
    await tasks.save(
        Task.create({
            id: 't2',
            title: TaskTitle.of('Другая'),
            creatorId: 'anna',
            now: new Date('2026-01-01T00:00:00Z'),
        }),
    );
});

afterEach((): void => {
    vi.restoreAllMocks();
});

const file = (content = 'hello', name = 'report.txt'): UploadedFile => ({
    name,
    contentType: 'text/plain',
    stream: Readable.from([Buffer.from(content)]),
});

const upload = (): UploadAttachmentUseCase =>
    new UploadAttachmentUseCase(tasks, attachments, storage, settings, policy, fakeClock);

const seedAttachment = async (
    overrides: { id?: string; taskId?: string; content?: string } = {},
): Promise<TaskAttachment> => {
    const { storageKey } = await storage.save(
        Readable.from([Buffer.from(overrides.content ?? 'abc')]),
        {
            maxBytes: 1024,
        },
    );
    const attachment = TaskAttachment.create({
        id: overrides.id ?? 'a1',
        taskId: overrides.taskId ?? 't1',
        originalName: FileName.of('doc.pdf'),
        storageKey,
        sizeBytes: 3,
        contentType: 'application/pdf',
        uploadedBy: 'anna',
        createdAt: NOW,
    });
    await attachments.insert(attachment);
    return attachment;
};

describe('UploadAttachmentUseCase', () => {
    it('stores the file and its metadata', async () => {
        const view = await upload().execute(me, 't1', file('hello'));

        expect(view).toMatchObject({
            taskId: 't1',
            originalName: 'report.txt',
            sizeBytes: 5,
            contentType: 'text/plain',
            uploadedBy: 'me',
            createdAt: NOW,
        });
        expect(attachments.byId.get(view.id)?.storageKey).toBeDefined();
        expect(storage.files.get(attachments.byId.get(view.id)?.storageKey ?? '')?.toString()).toBe(
            'hello',
        );
    });

    it('cleans the original name before storing metadata', async () => {
        const view = await upload().execute(me, 't1', file('x', '../../etc/passwd'));

        expect(view.originalName).toBe('passwd');
    });

    it('does not write the file when the task does not exist', async () => {
        await expect(upload().execute(me, 'missing', file())).rejects.toBeInstanceOf(
            TaskNotFoundError,
        );

        expect(storage.save).not.toHaveBeenCalled();
    });

    it('does not write the file when the policy refuses', async () => {
        policy.allowed = false;

        await expect(upload().execute(me, 't1', file())).rejects.toBeInstanceOf(
            TaskAccessDeniedError,
        );

        expect(storage.save).not.toHaveBeenCalled();
    });

    it('does not write the file when the attachment limit is reached', async () => {
        await seedAttachment({ id: 'a1' });
        await seedAttachment({ id: 'a2' });
        storage.save.mockClear();

        await expect(upload().execute(me, 't1', file())).rejects.toBeInstanceOf(
            AttachmentLimitReachedError,
        );

        expect(storage.save).not.toHaveBeenCalled();
    });

    it('counts the limit per task', async () => {
        await seedAttachment({ id: 'a1', taskId: 't2' });
        await seedAttachment({ id: 'a2', taskId: 't2' });

        await expect(upload().execute(me, 't1', file())).resolves.toBeDefined();
    });

    it('rejects an oversized file without leaving file or record', async () => {
        const filesBefore = storage.files.size;

        await expect(upload().execute(me, 't1', file('x'.repeat(2000)))).rejects.toBeInstanceOf(
            AttachmentTooLargeError,
        );

        expect(storage.files.size).toBe(filesBefore);
        expect(attachments.insertWithinLimit).not.toHaveBeenCalled();
        expect(storage.save).toHaveBeenCalledWith(expect.anything(), { maxBytes: 1024 });
    });

    it('inserts through the atomic limit check with the configured limit', async () => {
        await upload().execute(me, 't1', file());

        expect(attachments.insertWithinLimit).toHaveBeenCalledWith(expect.anything(), 2);
    });

    it('removes the stored file and reports the limit when a concurrent upload won the race', async () => {
        attachments.insertWithinLimit.mockResolvedValueOnce('limit-reached');

        await expect(upload().execute(me, 't1', file())).rejects.toBeInstanceOf(
            AttachmentLimitReachedError,
        );

        expect(storage.delete).toHaveBeenCalledTimes(1);
        expect(storage.files.size).toBe(0);
    });

    it('removes the stored file and reports 404 when the task was deleted meanwhile', async () => {
        attachments.insertWithinLimit.mockResolvedValueOnce('task-missing');

        await expect(upload().execute(me, 't1', file())).rejects.toBeInstanceOf(TaskNotFoundError);

        expect(storage.delete).toHaveBeenCalledTimes(1);
        expect(storage.files.size).toBe(0);
    });

    it('deletes the stored file when saving metadata fails', async () => {
        attachments.insertWithinLimit.mockRejectedValueOnce(new Error('db down'));

        await expect(upload().execute(me, 't1', file())).rejects.toThrow('db down');

        expect(storage.delete).toHaveBeenCalledTimes(1);
        expect(storage.files.size).toBe(0);
    });

    it('still reports the metadata failure when the compensating delete fails too', async () => {
        attachments.insertWithinLimit.mockRejectedValueOnce(new Error('db down'));
        storage.delete.mockRejectedValueOnce(new Error('disk gone'));

        await expect(upload().execute(me, 't1', file())).rejects.toThrow('db down');
    });
});

describe('DownloadAttachmentUseCase', () => {
    const download = (): DownloadAttachmentUseCase =>
        new DownloadAttachmentUseCase(tasks, attachments, storage, policy);

    it('returns metadata and the file stream', async () => {
        await seedAttachment({ content: 'bytes' });

        const result = await download().execute(me, 't1', 'a1');

        expect(result.meta).toMatchObject({ id: 'a1', originalName: 'doc.pdf' });
        const chunks: Buffer[] = [];
        for await (const chunk of result.stream) chunks.push(Buffer.from(chunk as Uint8Array));
        expect(Buffer.concat(chunks).toString()).toBe('bytes');
    });

    it('returns 404 for an attachment of another task', async () => {
        await seedAttachment({ taskId: 't2' });

        await expect(download().execute(me, 't1', 'a1')).rejects.toBeInstanceOf(
            AttachmentNotFoundError,
        );
    });

    it('returns 404 when the task does not exist', async () => {
        await expect(download().execute(me, 'missing', 'a1')).rejects.toBeInstanceOf(
            TaskNotFoundError,
        );
    });

    it('refuses when the policy forbids reading the task', async () => {
        await seedAttachment();
        policy.allowed = false;

        await expect(download().execute(me, 't1', 'a1')).rejects.toBeInstanceOf(
            TaskAccessDeniedError,
        );
    });

    it('returns 404 and logs an error when the file is missing in storage', async () => {
        const attachment = await seedAttachment();
        storage.files.delete(attachment.storageKey);

        await expect(download().execute(me, 't1', 'a1')).rejects.toBeInstanceOf(
            AttachmentNotFoundError,
        );

        expect(logError).toHaveBeenCalledTimes(1);
        expect(String(logError.mock.calls[0]?.[0])).toContain('a1');
    });
});

describe('DeleteAttachmentUseCase', () => {
    const remove = (): DeleteAttachmentUseCase =>
        new DeleteAttachmentUseCase(tasks, attachments, storage, policy);

    it('deletes the record and then the file', async () => {
        const attachment = await seedAttachment();
        const order: string[] = [];
        attachments.delete.mockImplementationOnce(() => {
            order.push('record');
            attachments.byId.delete('a1');
            return Promise.resolve(true);
        });
        storage.delete.mockImplementationOnce(() => {
            order.push('file');
            return Promise.resolve();
        });

        await remove().execute(me, 't1', 'a1');

        expect(order).toEqual(['record', 'file']);
        expect(storage.delete).toHaveBeenCalledWith(attachment.storageKey);
    });

    it('returns 404 on a repeated delete', async () => {
        await seedAttachment();
        await remove().execute(me, 't1', 'a1');

        await expect(remove().execute(me, 't1', 'a1')).rejects.toBeInstanceOf(
            AttachmentNotFoundError,
        );
    });

    it('returns 404 for an attachment of another task and keeps it', async () => {
        await seedAttachment({ taskId: 't2' });

        await expect(remove().execute(me, 't1', 'a1')).rejects.toBeInstanceOf(
            AttachmentNotFoundError,
        );
        expect(attachments.byId.has('a1')).toBe(true);
    });

    it('returns 404 when the task does not exist', async () => {
        await expect(remove().execute(me, 'missing', 'a1')).rejects.toBeInstanceOf(
            TaskNotFoundError,
        );
    });

    it('refuses when the policy forbids updating the task', async () => {
        await seedAttachment();
        policy.allowed = false;

        await expect(remove().execute(me, 't1', 'a1')).rejects.toBeInstanceOf(
            TaskAccessDeniedError,
        );
        expect(attachments.byId.has('a1')).toBe(true);
    });

    it('does not fail when removing the file fails, and logs it', async () => {
        await seedAttachment();
        storage.delete.mockRejectedValueOnce(new Error('disk gone'));

        await expect(remove().execute(me, 't1', 'a1')).resolves.toBeUndefined();

        expect(attachments.byId.has('a1')).toBe(false);
        expect(logError).toHaveBeenCalledTimes(1);
    });
});
