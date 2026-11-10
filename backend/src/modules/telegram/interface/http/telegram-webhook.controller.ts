import { createHash, timingSafeEqual } from 'node:crypto';
import {
    Body,
    Controller,
    Headers,
    HttpCode,
    HttpStatus,
    Post,
    UnauthorizedException,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PinoLogger } from 'nestjs-pino';
import { Public } from '../../../auth/interface/http/decorators';
import { BotUpdateDispatcher } from '../../application/bot-update-dispatcher';
import { TelegramSettingsPort } from '../../application/ports/telegram-settings.port';
import { TelegramUpdateMetricsPort } from '../../application/ports/telegram-update-metrics.port';

const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

function digestOf(secret: string): Buffer {
    return createHash('sha256').update(secret).digest();
}

export function isWebhookSecretMatching(
    expected: string | null,
    received: string | undefined,
): boolean {
    if (expected === null || received === undefined) return false;
    return timingSafeEqual(digestOf(expected), digestOf(received));
}

@ApiTags('telegram')
@Public()
@Controller('telegram')
export class TelegramWebhookController {
    constructor(
        private readonly dispatcher: BotUpdateDispatcher,
        private readonly settings: TelegramSettingsPort,
        private readonly metrics: TelegramUpdateMetricsPort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(TelegramWebhookController.name);
    }

    @Post('webhook')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Receive a Telegram update; called by Telegram in webhook mode' })
    @ApiHeader({ name: SECRET_HEADER, required: true, description: 'TELEGRAM_WEBHOOK_SECRET' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Update accepted, even if it failed' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or wrong secret' })
    async receive(
        @Headers(SECRET_HEADER) secret: string | undefined,
        @Body() update: unknown,
    ): Promise<void> {
        if (!isWebhookSecretMatching(this.settings.webhook?.secret ?? null, secret)) {
            this.logger.warn({}, 'Telegram webhook secret rejected');
            throw new UnauthorizedException();
        }
        this.metrics.recordUpdate(await this.dispatcher.dispatch(update));
    }
}
