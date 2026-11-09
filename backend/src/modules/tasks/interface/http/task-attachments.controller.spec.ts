import { Readable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteAttachmentUseCase } from '../../application/delete-attachment.use-case';
import { DownloadAttachmentUseCase } from '../../application/download-attachment.use-case';
import { UploadAttachmentUseCase } from '../../application/upload-attachment.use-case';
import {
    AttachmentLimitReachedError,
    AttachmentNotFoundError,
    AttachmentTooLargeError,
    TaskNotFoundError,
} from '../../domain/errors';
import { TaskAttachmentsController } from './task-attachments.controller';
import { type HttpFixture, startHttpFixture, USER_ID } from './testing/http-fixture';

const TASK_ID = '5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const ATT_ID = '9d1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const MAX_BYTES = 64;

const upload = { execute: vi.fn() };
const download = { execute: vi.fn() };
const remove = { execute: vi.fn() };

const meta = {
    id: ATT_ID,
    taskId: TASK_ID,
    originalName: 'Прайс 2026.pdf',
    sizeBytes: 5,
    contentType: 'application/pdf',
    uploadedBy: USER_ID,
    createdAt: new Date('2026-11-06T10:00:00.000Z'),
};

describe('TaskAttachmentsController', () => {
    let fixture: HttpFixture;

    beforeAll(async () => {
        fixture = await startHttpFixture({
            controllers: [TaskAttachmentsController],
            providers: [
                { provide: UploadAttachmentUseCase, useValue: upload },
                { provide: DownloadAttachmentUseCase, useValue: download },
                { provide: DeleteAttachmentUseCase, useValue: remove },
            ],
            maxFileSizeBytes: MAX_BYTES,
        });
    });

    afterAll(async () => {
        await fixture.app.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        remove.execute.mockResolvedValue(undefined);
        download.execute.mockResolvedValue({ meta, stream: Readable.from([Buffer.from('hello')]) });
        upload.execute.mockImplementation(
            async (_actor: unknown, _id: string, file: { stream: Readable }) => {
                await file.stream.toArray();
                return meta;
            },
        );
    });

    function send(
        form: FormData | undefined,
        path = `/tasks/${TASK_ID}/attachments`,
        headers: Record<string, string> = fixture.bearer(),
    ): Promise<Response> {
        return fetch(`${fixture.base}${path}`, { method: 'POST', headers, body: form });
    }

    function fileForm(content: string | Uint8Array, name = 'Прайс 2026.pdf'): FormData {
        const form = new FormData();
        form.append('file', new Blob([Buffer.from(content)], { type: 'application/pdf' }), name);
        return form;
    }

    describe('POST /tasks/:id/attachments', () => {
        it('streams the file to the use case and answers 201 with metadata', async () => {
            let received = '';
            upload.execute.mockImplementation(
                async (_actor: unknown, _id: string, file: { stream: Readable }) => {
                    for await (const chunk of file.stream) received += String(chunk);
                    return meta;
                },
            );

            const response = await send(fileForm('hello'));

            expect(response.status).toBe(201);
            expect(await response.json()).toEqual({
                id: ATT_ID,
                taskId: TASK_ID,
                originalName: 'Прайс 2026.pdf',
                sizeBytes: 5,
                contentType: 'application/pdf',
                uploadedBy: USER_ID,
                createdAt: '2026-11-06T10:00:00.000Z',
            });
            const [actor, taskId, file] = upload.execute.mock.calls[0] as [
                { userId: string },
                string,
                { name: string; contentType: string },
            ];
            expect(actor.userId).toBe(USER_ID);
            expect(taskId).toBe(TASK_ID);
            expect(file.name).toBe('Прайс 2026.pdf');
            expect(file.contentType).toBe('application/pdf');
            expect(received).toBe('hello');
        });

        it('answers 400 without the file field', async () => {
            const form = new FormData();
            form.append('note', 'x');
            expect((await send(form)).status).toBe(400);
            expect(upload.execute).not.toHaveBeenCalled();
        });

        it('answers 400 for an empty file', async () => {
            expect((await send(fileForm(''))).status).toBe(400);
            expect(upload.execute).not.toHaveBeenCalled();
        });

        it('answers 400 for a non-multipart request', async () => {
            const response = await fetch(`${fixture.base}/tasks/${TASK_ID}/attachments`, {
                method: 'POST',
                headers: { ...fixture.bearer(), 'content-type': 'application/json' },
                body: '{}',
            });
            expect(response.status).toBe(400);
        });

        it('answers 413 when the file exceeds the size limit', async () => {
            const response = await send(fileForm(new Uint8Array(MAX_BYTES + 1).fill(97)));
            expect(response.status).toBe(413);
            expect(upload.execute).not.toHaveBeenCalled();
        });

        it('answers 413 TASK_ATTACHMENT_TOO_LARGE when the storage rejects the file', async () => {
            upload.execute.mockRejectedValue(new AttachmentTooLargeError(MAX_BYTES));
            const response = await send(fileForm('hello'));
            expect(response.status).toBe(413);
            expect(await response.json()).toMatchObject({ code: 'TASK_ATTACHMENT_TOO_LARGE' });
        });

        it('answers 422 TASK_ATTACHMENT_LIMIT when the task is full', async () => {
            upload.execute.mockRejectedValue(new AttachmentLimitReachedError(10));
            const response = await send(fileForm('hello'));
            expect(response.status).toBe(422);
            expect(await response.json()).toMatchObject({ code: 'TASK_ATTACHMENT_LIMIT' });
        });

        it('destroys the spool stream when the use case rejects without reading it', async () => {
            let stream: Readable | undefined;
            upload.execute.mockImplementation(
                (_actor: unknown, _id: string, file: { stream: Readable }) => {
                    stream = file.stream;
                    return Promise.reject(new AttachmentLimitReachedError(10));
                },
            );

            expect((await send(fileForm('hello'))).status).toBe(422);

            expect(stream?.destroyed).toBe(true);
        });

        it('answers 404 when the task is missing', async () => {
            upload.execute.mockRejectedValue(new TaskNotFoundError(TASK_ID));
            expect((await send(fileForm('hello'))).status).toBe(404);
        });

        it('answers 401 without a token', async () => {
            const response = await send(fileForm('hello'), `/tasks/${TASK_ID}/attachments`, {});
            expect(response.status).toBe(401);
            expect(upload.execute).not.toHaveBeenCalled();
        });
    });

    describe('GET /tasks/:id/attachments/:attachmentId', () => {
        const path = `/tasks/${TASK_ID}/attachments/${ATT_ID}`;

        it('serves the bytes as a download with safe headers', async () => {
            const response = await fetch(`${fixture.base}${path}`, { headers: fixture.bearer() });

            expect(response.status).toBe(200);
            expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('hello');
            expect(response.headers.get('content-type')).toContain('application/pdf');
            expect(response.headers.get('x-content-type-options')).toBe('nosniff');
            const disposition = response.headers.get('content-disposition') ?? '';
            expect(disposition.startsWith('attachment;')).toBe(true);
            expect(disposition).toContain(
                `filename*=UTF-8''${encodeURIComponent('Прайс 2026.pdf')}`,
            );
            expect(download.execute.mock.calls[0]?.[1]).toBe(TASK_ID);
            expect(download.execute.mock.calls[0]?.[2]).toBe(ATT_ID);
        });

        it('escapes quotes and header-breaking characters in the file name', async () => {
            download.execute.mockResolvedValue({
                meta: { ...meta, originalName: 'a"b\'c(1)*.txt' },
                stream: Readable.from([Buffer.from('x')]),
            });
            const response = await fetch(`${fixture.base}${path}`, { headers: fixture.bearer() });
            const disposition = response.headers.get('content-disposition') ?? '';
            expect(disposition).toContain("filename*=UTF-8''a%22b%27c%281%29%2A.txt");
            expect(disposition).not.toContain('a"b');
        });

        it('answers 404 TASK_ATTACHMENT_NOT_FOUND', async () => {
            download.execute.mockRejectedValue(new AttachmentNotFoundError(ATT_ID));
            const response = await fetch(`${fixture.base}${path}`, { headers: fixture.bearer() });
            expect(response.status).toBe(404);
            expect(await response.json()).toMatchObject({ code: 'TASK_ATTACHMENT_NOT_FOUND' });
        });

        it('answers 401 without a token', async () => {
            expect((await fetch(`${fixture.base}${path}`)).status).toBe(401);
        });

        it('answers 400 for malformed ids', async () => {
            const response = await fetch(
                `${fixture.base}/tasks/${TASK_ID}/attachments/not-a-uuid`,
                {
                    headers: fixture.bearer(),
                },
            );
            expect(response.status).toBe(400);
        });
    });

    describe('DELETE /tasks/:id/attachments/:attachmentId', () => {
        const path = `/tasks/${TASK_ID}/attachments/${ATT_ID}`;

        it('answers 204', async () => {
            const response = await fetch(`${fixture.base}${path}`, {
                method: 'DELETE',
                headers: fixture.bearer(),
            });
            expect(response.status).toBe(204);
            expect(remove.execute.mock.calls[0]?.[1]).toBe(TASK_ID);
            expect(remove.execute.mock.calls[0]?.[2]).toBe(ATT_ID);
        });

        it('answers 404 on a repeated delete', async () => {
            remove.execute.mockRejectedValue(new AttachmentNotFoundError(ATT_ID));
            const response = await fetch(`${fixture.base}${path}`, {
                method: 'DELETE',
                headers: fixture.bearer(),
            });
            expect(response.status).toBe(404);
        });

        it('answers 401 without a token', async () => {
            const response = await fetch(`${fixture.base}${path}`, { method: 'DELETE' });
            expect(response.status).toBe(401);
        });
    });
});
