import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../shared/config/env.schema';
import { SheetsReaderPort } from './application/sheets-reader.port';
import {
    createGoogleSheetsClient,
    GoogleSheetsReader,
    loadSourceSpreadsheets,
} from './infrastructure/google-sheets-reader';

@Module({
    providers: [
        {
            provide: SheetsReaderPort,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>): SheetsReaderPort =>
                new GoogleSheetsReader(
                    () =>
                        createGoogleSheetsClient({
                            GOOGLE_SERVICE_ACCOUNT_JSON: config.get('GOOGLE_SERVICE_ACCOUNT_JSON', {
                                infer: true,
                            }),
                            GOOGLE_SERVICE_ACCOUNT_KEY_FILE: config.get(
                                'GOOGLE_SERVICE_ACCOUNT_KEY_FILE',
                                { infer: true },
                            ),
                        }),
                    loadSourceSpreadsheets(),
                ),
        },
    ],
    exports: [SheetsReaderPort],
})
export class ProgramsEtlModule {}
