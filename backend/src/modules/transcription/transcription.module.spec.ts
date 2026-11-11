import { Global, Module, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { afterEach, describe, expect, it } from 'vitest';
import { TranscribeVoiceUseCase } from './application/transcribe-voice.use-case';
import { TranscriberPort } from './domain/ports/transcriber.port';
import { Transcriber } from './infrastructure/openrouter/transcriber';
import { TranscriptionModule } from './transcription.module';

const values: Record<string, unknown> = {
    OPENROUTER_API_KEY: 'sk-or-test',
    OPENROUTER_BASE_URL: 'https://openrouter.test/api/v1',
    TRANSCRIPTION_MODEL: 'google/gemini-3.1-flash-lite',
};

@Global()
@Module({
    providers: [{ provide: ConfigService, useValue: { get: (key: string) => values[key] } }],
    exports: [ConfigService],
})
class FakeConfigModule {}

describe('TranscriptionModule', () => {
    let app: INestApplication | undefined;

    async function createApp(): Promise<INestApplication> {
        const moduleRef = await Test.createTestingModule({
            imports: [
                FakeConfigModule,
                LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
                TranscriptionModule,
            ],
        }).compile();
        const nestApp = moduleRef.createNestApplication({ logger: false });
        await nestApp.init();
        return nestApp;
    }

    afterEach(async () => {
        await app?.close();
        app = undefined;
    });

    it('builds the use case on top of the OpenRouter adapter', async () => {
        app = await createApp();

        expect(app.get(TranscribeVoiceUseCase)).toBeInstanceOf(TranscribeVoiceUseCase);
        expect(app.get(TranscriberPort)).toBeInstanceOf(Transcriber);
    });

    it('exports only the use case', () => {
        const exported: unknown = Reflect.getMetadata(MODULE_METADATA.EXPORTS, TranscriptionModule);

        expect(exported).toEqual([TranscribeVoiceUseCase]);
    });
});
