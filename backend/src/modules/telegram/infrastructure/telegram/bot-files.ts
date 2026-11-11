import { Injectable } from '@nestjs/common';
import { BotFilesPort, type BotFile } from '../../application/ports/bot-files.port';
import { BotApiClient } from './bot-api-client';

@Injectable()
export class BotFiles extends BotFilesPort {
    constructor(private readonly client: BotApiClient) {
        super();
    }

    getFile(fileId: string): Promise<BotFile> {
        return this.client.getFile(fileId);
    }

    downloadFile(filePath: string): Promise<Buffer> {
        return this.client.downloadFile(filePath);
    }
}
