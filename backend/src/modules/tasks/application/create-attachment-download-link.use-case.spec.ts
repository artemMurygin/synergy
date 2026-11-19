import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Actor } from '../domain/actor';
import { TaskAccessDeniedError } from '../domain/access-denied.error';
import {
    AttachmentNotFoundError,
    TaskAttachmentLinksUnavailableError,
    TaskNotFoundError,
} from '../domain/errors';
import { FileName } from '../domain/file-name';
import type { AttachmentDownloadTokenPort } from '../domain/ports/attachment-download-token.port';
import { Task } from '../domain/task';
import { TaskAttachment } from '../domain/task-attachment';
import { TaskTitle } from '../domain/task-title';
import { CreateAttachmentDownloadLinkUseCase } from './create-attachment-download-link.use-case';
import {
    FakeAccessPolicy,
    FakeTasksSettings,
    InMemoryAttachmentRepository,
    InMemoryTaskRepository,
    NOW,
} from './test-doubles';

const me = Actor.of('me');
const EXPIRES = new Date('2026-01-10T12:05:00Z');

let tasks: InMemoryTaskRepository;
let attachments: InMemoryAttachmentRepository;
let policy: FakeAccessPolicy;
let tokens: { sign: ReturnType<typeof vi.fn>; verify: ReturnType<typeof vi.fn> };

const useCase = (): CreateAttachmentDownloadLinkUseCase =>
    new CreateAttachmentDownloadLinkUseCase(
        tasks,
        attachments,
        policy,
        tokens as unknown as AttachmentDownloadTokenPort,
        new FakeTasksSettings(),
    );

beforeEach(async () => {
    tasks = new InMemoryTaskRepository();
    attachments = new InMemoryAttachmentRepository();
    policy = new FakeAccessPolicy();
    tokens = {
        sign: vi.fn(() => ({ token: 'a b+c', expiresAt: EXPIRES })),
        verify: vi.fn(),
    };
    for (const id of ['t1', 't2']) {
        await tasks.save(
            Task.create({ id, title: TaskTitle.of('Задача'), creatorId: 'anna', now: NOW }),
        );
    }
    await attachments.insert(
        TaskAttachment.create({
            id: 'a1',
            taskId: 't1',
            originalName: FileName.of('doc.pdf'),
            storageKey: 'k1',
            sizeBytes: 3,
            contentType: 'application/pdf',
            uploadedBy: 'anna',
            createdAt: NOW,
        }),
    );
});

describe('CreateAttachmentDownloadLinkUseCase', () => {
    it('returns a relative url with the encoded token and expiry', async () => {
        const link = await useCase().execute(me, 't1', 'a1');

        expect(tokens.sign).toHaveBeenCalledWith('a1', 300);
        expect(link).toEqual({
            url: '/tasks/t1/attachments/a1/content?token=a%20b%2Bc',
            expiresAt: EXPIRES,
        });
    });

    it('404 when the task does not exist', async () => {
        await expect(useCase().execute(me, 'missing', 'a1')).rejects.toBeInstanceOf(
            TaskNotFoundError,
        );
    });

    it('404 when the attachment belongs to another task', async () => {
        await expect(useCase().execute(me, 't2', 'a1')).rejects.toBeInstanceOf(
            AttachmentNotFoundError,
        );
    });

    it('refuses without read access, like DownloadAttachmentUseCase', async () => {
        policy.allowed = false;
        await expect(useCase().execute(me, 't1', 'a1')).rejects.toBeInstanceOf(
            TaskAccessDeniedError,
        );
        expect(tokens.sign).not.toHaveBeenCalled();
    });

    it('propagates TASK_ATTACHMENT_LINKS_UNAVAILABLE when there is no secret', async () => {
        tokens.sign.mockImplementation(() => {
            throw new TaskAttachmentLinksUnavailableError();
        });
        await expect(useCase().execute(me, 't1', 'a1')).rejects.toBeInstanceOf(
            TaskAttachmentLinksUnavailableError,
        );
    });
});
