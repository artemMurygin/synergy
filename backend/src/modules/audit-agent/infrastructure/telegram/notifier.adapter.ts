import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { NotifierPort } from '../../domain/ports/notifier.port';
import { PermanentNotifyError, TransientNotifyError } from '../../domain/errors/notify.errors';
import {
    HTTP_STATUS_SERVER_ERROR_MIN,
    HTTP_STATUS_TOO_MANY_REQUESTS,
    TELEGRAM_API_URL,
    TELEGRAM_CONFIG,
    TELEGRAM_FETCH,
} from './telegram.constants';

export interface TelegramConfig {
    botToken: string | undefined;
    timeoutMs: number;
}

const telegramErrorSchema = z.object({ description: z.string().optional() });

@Injectable()
export class NotifierAdapter extends NotifierPort {
    constructor(
        @Inject(TELEGRAM_CONFIG) private readonly config: TelegramConfig,
        @Inject(TELEGRAM_FETCH) private readonly fetchFn: typeof fetch,
    ) {
        super();
    }

    async send(chatId: string, text: string): Promise<void> {
        const { botToken, timeoutMs } = this.config;
        if (botToken === undefined) {
            throw new PermanentNotifyError('Telegram bot token is not configured');
        }
        const response = await this.post(botToken, timeoutMs, chatId, text);
        if (response.ok) {
            return;
        }
        const description = await this.readDescription(response);
        const message = `Telegram responded with ${String(response.status)}: ${description}`;
        if (
            response.status === HTTP_STATUS_TOO_MANY_REQUESTS ||
            response.status >= HTTP_STATUS_SERVER_ERROR_MIN
        ) {
            throw new TransientNotifyError(message);
        }
        throw new PermanentNotifyError(message);
    }

    private async post(
        botToken: string,
        timeoutMs: number,
        chatId: string,
        text: string,
    ): Promise<Response> {
        try {
            return await this.fetchFn(`${TELEGRAM_API_URL}/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text }),
                signal: AbortSignal.timeout(timeoutMs),
            });
        } catch (error: unknown) {
            const reason = error instanceof Error ? error.name : 'unknown';
            throw new TransientNotifyError(`Telegram request failed: ${reason}`);
        }
    }

    private async readDescription(response: Response): Promise<string> {
        try {
            const parsed = telegramErrorSchema.safeParse(await response.json());
            return parsed.success
                ? (parsed.data.description ?? 'no description')
                : 'no description';
        } catch {
            return 'unreadable body';
        }
    }
}
