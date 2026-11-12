import http from 'node:http';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { CreateDownloadLinkUseCase } from '../../application/create-download-link.use-case';
import { DeleteFileUseCase } from '../../application/delete-file.use-case';
import { DownloadFileContentUseCase } from '../../application/download-file-content.use-case';
import {
    EmptyFileError,
    FileNotFoundError,
    InvalidDownloadTokenError,
} from '../../application/errors';
import { GetFileUseCase } from '../../application/get-file.use-case';
import type { StoredFileView } from '../../application/stored-file-view';
import { UploadFileUseCase } from '../../application/upload-file.use-case';
import { FileGoneError, FileTooLargeError, UnsupportedMediaTypeError } from '../../domain/errors';
import { FilesController } from './files.controller';
import { type HttpFixture, startHttpFixture, USER_ID } from './testing/http-fixture';

const FILE_ID = '5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

const codeOf = async (response: Response): Promise<string> =>
    z.object({ code: z.string() }).parse(await response.json()).code;
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const upload = { execute: vi.fn() };
const getFile = { execute: vi.fn() };
const deleteFile = { execute: vi.fn() };
const createLink = { execute: vi.fn() };
const downloadContent = { execute: vi.fn() };

const view: StoredFileView = {
    id: FILE_ID,
    name: 'Отчёт.xlsx',
    mediaType: XLSX,
    kind: 'document',
    sizeBytes: 5,
    status: 'active',
    awaitingProcessing: false,
    uploadedAt: new Date('2026-11-06T10:00:00.000Z'),
    expiresAt: new Date('2026-12-06T10:00:00.000Z'),
    deletedAt: null,
};

describe('FilesController', () => {
    let fixture: HttpFixture;

    beforeAll(async () => {
        fixture = await startHttpFixture({
            controllers: [FilesController],
            providers: [
                { provide: UploadFileUseCase, useValue: upload },
                { provide: GetFileUseCase, useValue: getFile },
                { provide: DeleteFileUseCase, useValue: deleteFile },
                { provide: CreateDownloadLinkUseCase, useValue: createLink },
                { provide: DownloadFileContentUseCase, useValue: downloadContent },
            ],
        });
    });

    afterAll(async () => {
        await fixture.app.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        upload.execute.mockImplementation(async (input: { stream: Readable }) => {
            await input.stream.toArray();
            return view;
        });
        getFile.execute.mockResolvedValue(view);
        deleteFile.execute.mockResolvedValue(undefined);
    });

    function post(
        body: FormData | string | undefined,
        headers: Record<string, string> = fixture.bearer(),
    ): Promise<Response> {
        return fetch(`${fixture.base}/files`, { method: 'POST', headers, body });
    }

    function rawRequest(
        agent: http.Agent,
        method: string,
        path: string,
        body?: Buffer,
        headers: Record<string, string> = {},
    ): Promise<number> {
        const url = new URL(path, fixture.base);
        return new Promise((resolve, reject) => {
            const request = http.request(
                url,
                { method, agent, headers: { ...fixture.bearer(), ...headers } },
                (response) => {
                    response.resume();
                    response.on('end', () => {
                        resolve(response.statusCode ?? 0);
                    });
                },
            );
            request.on('error', reject);
            request.end(body);
        });
    }

    function fileForm(content: string, name = 'Отчёт.xlsx'): FormData {
        const form = new FormData();
        form.append('file', new Blob([Buffer.from(content)], { type: XLSX }), name);
        return form;
    }

    describe('POST /files', () => {
        it('streams a file with a Cyrillic name to the use case and answers 201', async () => {
            let received = '';
            upload.execute.mockImplementation(
                async (input: { ownerId: string; fileName: string; stream: Readable }) => {
                    for await (const chunk of input.stream) received += String(chunk);
                    return view;
                },
            );

            const response = await post(fileForm('hello'));

            expect(response.status).toBe(201);
            expect(await response.json()).toEqual({
                id: FILE_ID,
                name: 'Отчёт.xlsx',
                mediaType: XLSX,
                kind: 'document',
                sizeBytes: 5,
                status: 'active',
                awaitingProcessing: false,
                uploadedAt: '2026-11-06T10:00:00.000Z',
                expiresAt: '2026-12-06T10:00:00.000Z',
                deletedAt: null,
            });
            const [input] = upload.execute.mock.calls[0] as [{ ownerId: string; fileName: string }];
            expect(input.ownerId).toBe(USER_ID);
            expect(input.fileName).toBe('Отчёт.xlsx');
            expect(received).toBe('hello');
        });

        it('takes only the first file of the request', async () => {
            const form = fileForm('first');
            form.append('file', new Blob([Buffer.from('second')]), 'second.csv');

            expect((await post(form)).status).toBe(201);
            expect(upload.execute).toHaveBeenCalledTimes(1);
        });

        it('answers 400 without the file field', async () => {
            const form = new FormData();
            form.append('note', 'x');

            expect((await post(form)).status).toBe(400);
            expect(upload.execute).not.toHaveBeenCalled();
        });

        it('answers 400 when "file" is a plain field without a file', async () => {
            const form = new FormData();
            form.append('file', 'not a file');

            expect((await post(form)).status).toBe(400);
            expect(upload.execute).not.toHaveBeenCalled();
        });

        it('answers 400 for a non-multipart request', async () => {
            const response = await post('{}', {
                ...fixture.bearer(),
                'content-type': 'application/json',
            });
            expect(response.status).toBe(400);
            expect(upload.execute).not.toHaveBeenCalled();
        });

        it('answers 400 for an empty file', async () => {
            upload.execute.mockImplementation(async (input: { stream: Readable }) => {
                await input.stream.toArray();
                throw new EmptyFileError();
            });
            expect((await post(fileForm(''))).status).toBe(400);
        });

        it('answers 413 FILE_TOO_LARGE when the use case rejects the size', async () => {
            upload.execute.mockImplementation(async (input: { stream: Readable }) => {
                await input.stream.toArray();
                throw new FileTooLargeError(4);
            });

            const response = await post(fileForm('hello'));

            expect(response.status).toBe(413);
            expect(await codeOf(response)).toBe('FILE_TOO_LARGE');
        });

        it('answers 415 FILE_UNSUPPORTED_MEDIA_TYPE for a type outside the whitelist', async () => {
            upload.execute.mockImplementation((input: { stream: Readable }) => {
                input.stream.destroy();
                return Promise.reject(new UnsupportedMediaTypeError('application/x-msdownload'));
            });

            const response = await post(fileForm('MZ...'));

            expect(response.status).toBe(415);
            expect(await codeOf(response)).toBe('FILE_UNSUPPORTED_MEDIA_TYPE');
        });

        it('drains the rest of the body after an early rejection so the socket stays usable', async () => {
            upload.execute.mockImplementation((input: { stream: Readable }) => {
                input.stream.destroy();
                return Promise.reject(new FileTooLargeError(4));
            });
            const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
            const boundary = 'smoke-boundary';
            const body = Buffer.concat([
                Buffer.from(
                    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="big.txt"\r\n` +
                        'Content-Type: text/plain\r\n\r\n',
                ),
                Buffer.alloc(8 * 1024 * 1024, 97),
                Buffer.from(`\r\n--${boundary}--\r\n`),
            ]);

            try {
                const first = await rawRequest(agent, 'POST', '/files', body, {
                    'content-type': `multipart/form-data; boundary=${boundary}`,
                });
                const second = await rawRequest(agent, 'GET', `/files/${FILE_ID}`);

                expect(first).toBe(413);
                expect(second).toBe(200);
            } finally {
                agent.destroy();
            }
        });

        it('fails the file stream when the client aborts the upload midway', async () => {
            let outcome: Promise<string> = Promise.resolve('not started');
            const started = new Promise<void>((resolve) => {
                upload.execute.mockImplementation((input: { stream: Readable }) => {
                    outcome = input.stream.toArray().then(
                        () => 'ended',
                        () => 'errored',
                    );
                    resolve();
                    return outcome.then(() => view);
                });
            });
            const boundary = 'abort-boundary';
            const request = http.request(new URL('/files', fixture.base), {
                method: 'POST',
                headers: {
                    ...fixture.bearer(),
                    'content-type': `multipart/form-data; boundary=${boundary}`,
                    'content-length': String(10 * 1024 * 1024),
                },
            });
            request.on('error', () => undefined);
            request.write(
                `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\n` +
                    'Content-Type: text/plain\r\n\r\n' +
                    'a'.repeat(64 * 1024),
            );

            await started;
            request.destroy();
            const timeout = new Promise<string>((resolve) => {
                setTimeout(() => {
                    resolve('hung');
                }, 2000);
            });

            expect(await Promise.race([outcome, timeout])).toBe('errored');
        });

        it('answers 401 without a token', async () => {
            expect((await post(fileForm('hello'), {})).status).toBe(401);
            expect(upload.execute).not.toHaveBeenCalled();
        });
    });

    describe('GET /files/:id', () => {
        it('answers 200 with metadata of the own file', async () => {
            const response = await fetch(`${fixture.base}/files/${FILE_ID}`, {
                headers: fixture.bearer(),
            });

            expect(response.status).toBe(200);
            expect(z.object({ name: z.string() }).parse(await response.json()).name).toBe(
                'Отчёт.xlsx',
            );
            expect(getFile.execute).toHaveBeenCalledWith({ ownerId: USER_ID, fileId: FILE_ID });
        });

        it('answers 404 for a file of another user', async () => {
            getFile.execute.mockRejectedValue(new FileNotFoundError(FILE_ID));

            const response = await fetch(`${fixture.base}/files/${FILE_ID}`, {
                headers: fixture.bearer(),
            });

            expect(response.status).toBe(404);
            expect(await codeOf(response)).toBe('FILE_NOT_FOUND');
        });

        it('answers 400 for a malformed id', async () => {
            const response = await fetch(`${fixture.base}/files/not-a-uuid`, {
                headers: fixture.bearer(),
            });
            expect(response.status).toBe(400);
        });

        it('answers 401 without a token', async () => {
            expect((await fetch(`${fixture.base}/files/${FILE_ID}`)).status).toBe(401);
        });
    });

    describe('DELETE /files/:id', () => {
        it('answers 204 and again 204 on a repeated delete', async () => {
            const remove = (): Promise<Response> =>
                fetch(`${fixture.base}/files/${FILE_ID}`, {
                    method: 'DELETE',
                    headers: fixture.bearer(),
                });

            expect((await remove()).status).toBe(204);
            expect((await remove()).status).toBe(204);
            expect(deleteFile.execute).toHaveBeenCalledWith({ ownerId: USER_ID, fileId: FILE_ID });
        });
    });

    describe('POST /files/:id/download-link', () => {
        const path = `/files/${FILE_ID}/download-link`;

        it('answers 200 with url and expiresAt', async () => {
            createLink.execute.mockResolvedValue({
                url: `/files/${FILE_ID}/content?token=abc`,
                expiresAt: new Date('2026-11-06T10:05:00.000Z'),
            });

            const response = await fetch(`${fixture.base}${path}`, {
                method: 'POST',
                headers: fixture.bearer(),
            });

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({
                url: `/files/${FILE_ID}/content?token=abc`,
                expiresAt: '2026-11-06T10:05:00.000Z',
            });
            expect(createLink.execute).toHaveBeenCalledWith({ ownerId: USER_ID, fileId: FILE_ID });
        });

        it('answers 410 for a deleted file', async () => {
            createLink.execute.mockRejectedValue(new FileGoneError(FILE_ID));
            const response = await fetch(`${fixture.base}${path}`, {
                method: 'POST',
                headers: fixture.bearer(),
            });
            expect(response.status).toBe(410);
        });
    });

    describe('GET /files/:id/content', () => {
        const path = `/files/${FILE_ID}/content?token=signed-token`;

        it('streams the file without Authorization with an RFC 5987 disposition', async () => {
            downloadContent.execute.mockResolvedValue({
                stream: Readable.from([Buffer.from('hello')]),
                name: 'Отчёт.xlsx',
                contentType: XLSX,
                sizeBytes: 5,
            });

            const response = await fetch(`${fixture.base}${path}`);

            expect(response.status).toBe(200);
            expect(await response.text()).toBe('hello');
            expect(response.headers.get('content-type')).toBe(XLSX);
            expect(response.headers.get('content-disposition')).toBe(
                `attachment; filename="_____.xlsx"; filename*=UTF-8''${encodeURIComponent('Отчёт.xlsx')}`,
            );
            expect(response.headers.get('x-content-type-options')).toBe('nosniff');
            expect(downloadContent.execute).toHaveBeenCalledWith({
                fileId: FILE_ID,
                token: 'signed-token',
            });
        });

        it('answers 403 for an invalid or expired token', async () => {
            downloadContent.execute.mockRejectedValue(new InvalidDownloadTokenError());

            const response = await fetch(`${fixture.base}${path}`);

            expect(response.status).toBe(403);
            expect(await codeOf(response)).toBe('FILE_DOWNLOAD_TOKEN_INVALID');
        });

        it('answers 403 without a token', async () => {
            downloadContent.execute.mockRejectedValue(new InvalidDownloadTokenError());

            const response = await fetch(`${fixture.base}/files/${FILE_ID}/content`);

            expect(response.status).toBe(403);
            expect(downloadContent.execute).toHaveBeenCalledWith({ fileId: FILE_ID, token: '' });
        });

        it('answers 410 for a deleted file', async () => {
            downloadContent.execute.mockRejectedValue(new FileGoneError(FILE_ID));

            expect((await fetch(`${fixture.base}${path}`)).status).toBe(410);
        });
    });
});
