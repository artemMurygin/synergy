import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../shared/config/env.schema';
import { TranscribeVoiceUseCase } from './application/transcribe-voice.use-case';
import { TranscriberPort } from './domain/ports/transcriber.port';
import { Transcriber } from './infrastructure/openrouter/transcriber';

@Module({
    providers: [
        {
            provide: TranscriberPort,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>): TranscriberPort =>
                new Transcriber(Transcriber.settingsFromConfig(config)),
        },
        TranscribeVoiceUseCase,
    ],
    exports: [TranscribeVoiceUseCase],
})
export class TranscriptionModule {}
