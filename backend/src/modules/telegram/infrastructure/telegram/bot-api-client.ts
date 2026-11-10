import { Inject, Injectable, Optional } from '@nestjs/common';
import { z } from 'zod';
import type { BaseError } from '../../../../shared/errors';
import {
    PermanentDeliveryError,
    RetryLaterDeliveryError,
} from '../../../../shared/outbox/domain/delivery-errors';
import { ChatUnavailableError, TransientDeliveryError } from '../../application/errors';
import type { SentBotMessage } from '../../application/ports/bot-messenger.port';
import { TelegramSettingsPort } from '../../application/ports/telegram-settings.port';
import { MS_IN_SECOND } from '../../domain/time-units';

export const BOT_API_TIMEOUTS = Symbol('BOT_API_TIMEOUTS');

export interface BotApiTimeouts {
    readonly requestTimeoutMs: number;
    readonly pollGraceMs: number;
}

export const DEFAULT_BOT_API_TIMEOUTS: BotApiTimeouts = {
    requestTimeoutMs: 10_000,
    pollGraceMs: 10_000,
};

export type BotMethod = 'sendMessage' | 'setWebhook' | 'deleteWebhook' | 'getUpdates';

export type BotUpdateType = 'message';

export interface BotCallOptions {
    readonly timeoutMs?: number;
    readonly signal?: AbortSignal;
}

export interface WebhookRegistration {
    readonly url: string;
    readonly secretToken: string;
    readonly allowedUpdates: readonly BotUpdateType[];
}

export interface UpdatesRequest {
    readonly offset: number;
    readonly timeoutSeconds: number;
    readonly allowedUpdates: readonly BotUpdateType[];
    readonly signal?: AbortSignal;
}

export class BotApiConflictError extends PermanentDeliveryError {}

const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_CONFLICT = 409;
const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
const HTTP_STATUS_SERVER_ERROR_MIN = 500;
const REDACTED = '[redacted]';
const NO_DESCRIPTION = 'no description';
const UNAVAILABLE_CHAT_BY_STATUS = new Map<number, RegExp>([
    [HTTP_STATUS_FORBIDDEN, /bot was blocked by the user|user is deactivated/i],
    [HTTP_STATUS_BAD_REQUEST, /chat not found/i],
]);

const envelopeSchema = z.object({
    ok: z.boolean(),
    result: z.unknown().optional(),
    description: z.string().optional(),
    parameters: z.object({ retry_after: z.number().int().nonnegative().optional() }).nullish(),
});

type Envelope = z.infer<typeof envelopeSchema>;

const sentMessageSchema = z.object({ message_id: z.number().int().positive() });
const trueSchema = z.literal(true);
const updatesSchema = z.array(z.unknown());

@Injectable()
export class BotApiClient {
    private readonly timeouts: BotApiTimeouts;

    constructor(
        private readonly settings: TelegramSettingsPort,
        @Optional() @Inject(BOT_API_TIMEOUTS) timeouts?: Partial<BotApiTimeouts>,
    ) {
        this.timeouts = { ...DEFAULT_BOT_API_TIMEOUTS, ...timeouts };
    }

    async sendMessage(chatId: bigint, html: string): Promise<SentBotMessage> {
        const sent = await this.call(
            'sendMessage',
            { chat_id: chatId.toString(), text: html, parse_mode: 'HTML' },
            sentMessageSchema,
        );
        return { messageId: BigInt(sent.message_id) };
    }

    async setWebhook(registration: WebhookRegistration): Promise<void> {
        await this.call(
            'setWebhook',
            {
                url: registration.url,
                secret_token: registration.secretToken,
                allowed_updates: registration.allowedUpdates,
            },
            trueSchema,
        );
    }

    async deleteWebhook(): Promise<void> {
        await this.call('deleteWebhook', {}, trueSchema);
    }

    getUpdates(request: UpdatesRequest): Promise<unknown[]> {
        return this.call(
            'getUpdates',
            {
                offset: request.offset,
                timeout: request.timeoutSeconds,
                allowed_updates: request.allowedUpdates,
            },
            updatesSchema,
            {
                timeoutMs: request.timeoutSeconds * MS_IN_SECOND + this.timeouts.pollGraceMs,
                signal: request.signal,
            },
        );
    }

    private async call<TResult>(
        method: BotMethod,
        params: Record<string, unknown>,
        schema: z.ZodType<TResult>,
        options: BotCallOptions = {},
    ): Promise<TResult> {
        const token = this.settings.botToken;
        if (token === null) {
            throw new PermanentDeliveryError('Telegram bot token is not configured', undefined, {
                method,
            });
        }
        const response = await this.post(token, method, params, options);
        const envelope = envelopeSchema.safeParse(await readJson(response));
        if (!response.ok) {
            throw classifyFailure(method, response.status, envelope.data ?? null, token);
        }
        if (!envelope.success || !envelope.data.ok) throw invalidResponse(method);
        const parsed = schema.safeParse(envelope.data.result);
        if (!parsed.success) throw invalidResponse(method);
        return parsed.data;
    }

    private async post(
        token: string,
        method: BotMethod,
        params: Record<string, unknown>,
        options: BotCallOptions,
    ): Promise<Response> {
        const timeoutSignal = AbortSignal.timeout(
            options.timeoutMs ?? this.timeouts.requestTimeoutMs,
        );
        const signal =
            options.signal === undefined
                ? timeoutSignal
                : AbortSignal.any([timeoutSignal, options.signal]);
        try {
            return await fetch(`${this.settings.apiBaseUrl}/bot${token}/${method}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(params),
                signal,
            });
        } catch (error: unknown) {
            const reason = error instanceof Error ? error.name : 'unknown';
            throw new TransientDeliveryError(
                `Bot API ${method} request failed: ${reason}`,
                undefined,
                {
                    method,
                    reason,
                },
            );
        }
    }
}

async function readJson(response: Response): Promise<unknown> {
    try {
        const body: unknown = await response.json();
        return body;
    } catch {
        return undefined;
    }
}

function invalidResponse(method: BotMethod): PermanentDeliveryError {
    return new PermanentDeliveryError(
        `Bot API ${method} returned an unexpected response`,
        undefined,
        {
            method,
        },
    );
}

function classifyFailure(
    method: BotMethod,
    status: number,
    envelope: Envelope | null,
    token: string,
): BaseError {
    const description = (envelope?.description ?? NO_DESCRIPTION).replaceAll(token, REDACTED);
    const message = `Bot API ${method} responded with ${String(status)}: ${description}`;
    const metadata = { method, status, description };
    const retryAfterSeconds = envelope?.parameters?.retry_after;
    if (status === HTTP_STATUS_TOO_MANY_REQUESTS && retryAfterSeconds !== undefined) {
        return new RetryLaterDeliveryError(
            message,
            retryAfterSeconds * MS_IN_SECOND,
            undefined,
            metadata,
        );
    }
    if (status === HTTP_STATUS_TOO_MANY_REQUESTS || status >= HTTP_STATUS_SERVER_ERROR_MIN) {
        return new TransientDeliveryError(message, undefined, metadata);
    }
    if (UNAVAILABLE_CHAT_BY_STATUS.get(status)?.test(description) === true) {
        return new ChatUnavailableError(message, undefined, metadata);
    }
    if (status === HTTP_STATUS_CONFLICT) {
        return new BotApiConflictError(message, undefined, metadata);
    }
    return new PermanentDeliveryError(message, undefined, metadata);
}
