import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../../shared/config/env.schema';
import { NotifierPort } from '../../domain/ports/notifier.port';
import { NotifierAdapter } from './notifier.adapter';
import type { TelegramConfig } from './notifier.adapter';
import { TELEGRAM_CONFIG, TELEGRAM_FETCH, TELEGRAM_REQUEST_TIMEOUT_MS } from './telegram.constants';

@Module({
    providers: [
        {
            provide: TELEGRAM_CONFIG,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>): TelegramConfig => ({
                botToken: config.get('TELEGRAM_BOT_TOKEN', { infer: true }),
                timeoutMs: TELEGRAM_REQUEST_TIMEOUT_MS,
            }),
        },
        { provide: TELEGRAM_FETCH, useValue: fetch },
        { provide: NotifierPort, useClass: NotifierAdapter },
    ],
    exports: [NotifierPort],
})
export class TelegramModule {}
