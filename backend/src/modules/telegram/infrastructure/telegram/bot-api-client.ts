import { Inject, Injectable, Optional } from '@nestjs/common';
import { z } from 'zod';
import type { BaseError } from '../../../../shared/errors';
import {
    BotApiConflictError,
    BotApiRateLimitedError,
    BotApiRejectedError,
    ChatUnavailableError,
    TransientDeliveryError,
} from '../../application/errors';
import type { BotFile } from '../../application/ports/bot-files.port';
import type { BotChatAction, SentBotMessage } from '../../application/ports/bot-messenger.port';
import { TelegramSettingsPort } from '../../application/ports/telegram-settings.port';
import { MS_IN_SECOND } from '../../domain/time-units';

export const BOT_API_TIMEOUTS = Symbol('BOT_API_TIMEOUTS');

export interface BotApiTimeouts {
    readonly requestTimeoutMs: number;
    readonly pollGraceMs: number;
    readonly downloadTimeoutMs: number;
}

export const DEFAULT_BOT_API_TIMEOUTS: BotApiTimeouts = {
    requestTimeoutMs: 10_000,
    pollGraceMs: 10_000,
    downloadTimeoutMs: 30_000,
};

export type BotMethod =
    'sendMessage' | 'setWebhook' | 'deleteWebhook' | 'getUpdates' | 'getFile' | 'sendChatAction';

/** Name of a file download in errors and metadata; it is not a Bot API method. */
const DOWNLOAD_FILE = 'downloadFile';

type BotRequestName = BotMethod | typeof DOWNLOAD_FILE;

export interface SendMessageOptions {
    /** Sends the text as is, without parse_mode. */
    readonly plainText?: boolean;
}

/** Telegram rejected the message because its HTML entities cannot be parsed. */
export class UnparsableEntitiesError extends BotApiRejectedError {}

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

const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_CONFLICT = 409;
const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
const HTTP_STATUS_SERVER_ERROR_MIN = 500;
const CHAT_NOT_FOUND = /chat not found/i;
const CANT_PARSE_ENTITIES = /can't parse entities/i;

type FailureReason =
    | 'server_error'
    | 'rate_limited'
    | 'chat_unavailable'
    | 'conflict'
    | 'unparsable_entities'
    | 'rejected';

const envelopeSchema = z.object({
    ok: z.boolean(),
    result: z.unknown().optional(),
    description: z.string().optional(),
    parameters: z.object({ retry_after: z.number().int().nonnegative().optional() }).nullish(),
});

type Envelope = z.infer<typeof envelopeSchema>;

const sentMessageSchema = z.object({ message_id: z.number().int().positive() });
const fileSchema = z.object({
    file_path: z.string().min(1),
    file_size: z.number().int().nonnegative().optional(),
});
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

    async sendMessage(
        chatId: bigint,
        text: string,
        options: SendMessageOptions = {},
    ): Promise<SentBotMessage> {
        const sent = await this.call(
            'sendMessage',
            {
                chat_id: chatId.toString(),
                text,
                ...(options.plainText === true ? {} : { parse_mode: 'HTML' }),
            },
            sentMessageSchema,
        );
        return { messageId: BigInt(sent.message_id) };
    }

    async sendChatAction(chatId: bigint, action: BotChatAction): Promise<void> {
        await this.call('sendChatAction', { chat_id: chatId.toString(), action }, trueSchema);
    }

    async getFile(fileId: string): Promise<BotFile> {
        const file = await this.call('getFile', { file_id: fileId }, fileSchema);
        return { filePath: file.file_path, fileSize: file.file_size ?? null };
    }

    /** Downloads a file by the path from getFile; the link with the token is never exposed. */
    async downloadFile(filePath: string): Promise<Buffer> {
        const token = this.requireToken(DOWNLOAD_FILE);
        const response = await this.fetchOrThrow(
            DOWNLOAD_FILE,
            `${this.settings.apiBaseUrl}/file/bot${token}/${filePath}`,
            { method: 'GET' },
            { timeoutMs: this.timeouts.downloadTimeoutMs },
        );
        if (!response.ok) throw classifyFailure(DOWNLOAD_FILE, response.status, null);
        try {
            return Buffer.from(await response.arrayBuffer());
        } catch (error: unknown) {
            throw transportFailure(DOWNLOAD_FILE, error);
        }
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
        const token = this.requireToken(method);
        const response = await this.post(token, method, params, options);
        const envelope = envelopeSchema.safeParse(await readJson(response));
        if (!response.ok) {
            throw classifyFailure(method, response.status, envelope.data ?? null);
        }
        if (!envelope.success || !envelope.data.ok) throw invalidResponse(method);
        const parsed = schema.safeParse(envelope.data.result);
        if (!parsed.success) throw invalidResponse(method);
        return parsed.data;
    }

    private requireToken(method: BotRequestName): string {
        const token = this.settings.botToken;
        if (token === null) {
            throw new BotApiRejectedError('Telegram bot token is not configured', undefined, {
                method,
                reason: 'not_configured',
            });
        }
        return token;
    }

    private post(
        token: string,
        method: BotMethod,
        params: Record<string, unknown>,
        options: BotCallOptions,
    ): Promise<Response> {
        return this.fetchOrThrow(
            method,
            `${this.settings.apiBaseUrl}/bot${token}/${method}`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(params),
            },
            options,
        );
    }

    private async fetchOrThrow(
        method: BotRequestName,
        url: string,
        init: RequestInit,
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
            return await fetch(url, { ...init, signal });
        } catch (error: unknown) {
            throw transportFailure(method, error);
        }
    }
}

function transportFailure(method: BotRequestName, error: unknown): TransientDeliveryError {
    const reason = error instanceof Error ? error.name : 'unknown';
    return new TransientDeliveryError(`Bot API ${method} request failed: ${reason}`, undefined, {
        method,
        reason,
    });
}

async function readJson(response: Response): Promise<unknown> {
    try {
        const body: unknown = await response.json();
        return body;
    } catch {
        return undefined;
    }
}

function invalidResponse(method: BotRequestName): BotApiRejectedError {
    return new BotApiRejectedError(`Bot API ${method} returned an unexpected response`, undefined, {
        method,
        reason: 'invalid_response',
    });
}

function failureReasonOf(status: number, envelope: Envelope | null): FailureReason {
    if (status === HTTP_STATUS_TOO_MANY_REQUESTS) return 'rate_limited';
    if (status >= HTTP_STATUS_SERVER_ERROR_MIN) return 'server_error';
    if (status === HTTP_STATUS_FORBIDDEN) return 'chat_unavailable';
    if (status === HTTP_STATUS_BAD_REQUEST && CHAT_NOT_FOUND.test(envelope?.description ?? '')) {
        return 'chat_unavailable';
    }
    if (
        status === HTTP_STATUS_BAD_REQUEST &&
        CANT_PARSE_ENTITIES.test(envelope?.description ?? '')
    ) {
        return 'unparsable_entities';
    }
    if (status === HTTP_STATUS_CONFLICT) return 'conflict';
    return 'rejected';
}

function classifyFailure(
    method: BotRequestName,
    status: number,
    envelope: Envelope | null,
): BaseError {
    const reason = failureReasonOf(status, envelope);
    const message = `Bot API ${method} responded with ${String(status)} (${reason})`;
    const metadata = { method, status, reason };
    switch (reason) {
        case 'rate_limited': {
            const retryAfterSeconds = envelope?.parameters?.retry_after;
            const retryAfterMs =
                retryAfterSeconds === undefined ? null : retryAfterSeconds * MS_IN_SECOND;
            return new BotApiRateLimitedError(message, retryAfterMs, undefined, metadata);
        }
        case 'server_error':
            return new TransientDeliveryError(message, undefined, metadata);
        case 'chat_unavailable':
            return new ChatUnavailableError(message, undefined, metadata);
        case 'conflict':
            return new BotApiConflictError(message, undefined, metadata);
        case 'unparsable_entities':
            return new UnparsableEntitiesError(message, undefined, metadata);
        case 'rejected':
            return new BotApiRejectedError(message, undefined, metadata);
    }
}
