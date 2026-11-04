import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import type { Env } from '../../../shared/config/env.schema';
import { SHEETS_READER_PORT } from '../programs-etl.tokens';
import { GoogleSheetsReader } from './google-sheets-reader';

const SHEETS_READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

/** Service-account key file comes from GOOGLE_SERVICE_ACCOUNT_KEY_FILE; without it Google ADC is used. */
@Module({
    providers: [
        {
            provide: SHEETS_READER_PORT,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>): GoogleSheetsReader => {
                const auth = new google.auth.GoogleAuth({
                    scopes: [SHEETS_READONLY_SCOPE],
                    keyFile: config.get('GOOGLE_SERVICE_ACCOUNT_KEY_FILE', { infer: true }),
                });
                return new GoogleSheetsReader(google.sheets({ version: 'v4', auth }), {
                    maxCells: config.get('PROGRAMS_ETL_SHEETS_MAX_CELLS', { infer: true }),
                });
            },
        },
    ],
    exports: [SHEETS_READER_PORT],
})
export class ProgramsEtlSheetsModule {}
