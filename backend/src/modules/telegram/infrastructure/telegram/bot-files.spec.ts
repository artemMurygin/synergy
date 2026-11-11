import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BotFilesPort } from '../../application/ports/bot-files.port';
import { BotApiStub } from '../../testing/bot-api-stub';
import { testTelegramSettings } from '../../testing/telegram-settings.fixture';
import { BotApiClient } from './bot-api-client';
import { BotFiles } from './bot-files';

describe('BotFiles', () => {
    let stub: BotApiStub;
    let files: BotFiles;

    beforeAll(async () => {
        stub = await BotApiStub.start();
        files = new BotFiles(new BotApiClient(testTelegramSettings({ apiBaseUrl: stub.baseUrl })));
    });

    afterEach(() => {
        stub.reset();
    });

    afterAll(async () => {
        await stub.stop();
    });

    it('implements the files port', () => {
        expect(files).toBeInstanceOf(BotFilesPort);
    });

    it('resolves a file id and downloads the file through the Bot API', async () => {
        const audio = Buffer.from('OggS-voice');
        stub.respond('getFile', {
            status: 200,
            body: {
                ok: true,
                result: {
                    file_id: 'v1',
                    file_unique_id: 'u1',
                    file_path: 'voice/a.oga',
                    file_size: 10,
                },
            },
        });
        stub.respondFile('voice/a.oga', { status: 200, body: audio });

        const file = await files.getFile('v1');
        const downloaded = await files.downloadFile(file.filePath);

        expect(file).toEqual({ filePath: 'voice/a.oga', fileSize: 10 });
        expect(Buffer.compare(downloaded, audio)).toBe(0);
    });
});
