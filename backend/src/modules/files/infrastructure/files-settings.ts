import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../shared/config/env.schema';
import { FilesSettingsPort } from '../domain/ports/files-settings.port';

const BYTES_IN_MB = 1024 * 1024;

@Injectable()
export class FilesSettings extends FilesSettingsPort {
    readonly maxRecordingBytes: number;
    readonly maxDocumentBytes: number;
    readonly downloadLinkTtlSec: number;

    constructor(config: ConfigService<Env, true>) {
        super();
        this.maxRecordingBytes =
            config.get('FILES_MAX_RECORDING_MB', { infer: true }) * BYTES_IN_MB;
        this.maxDocumentBytes = config.get('FILES_MAX_DOCUMENT_MB', { infer: true }) * BYTES_IN_MB;
        this.downloadLinkTtlSec = config.get('FILES_DOWNLOAD_LINK_TTL_SEC', { infer: true });
    }
}
