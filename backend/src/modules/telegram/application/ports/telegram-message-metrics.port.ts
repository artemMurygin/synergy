export type TelegramMessageKind = 'notification' | 'reply';

export type TelegramSendErrorReason =
    'transient' | 'rate_limited' | 'chat_unavailable' | 'permanent' | 'unknown';

export abstract class TelegramMessageMetricsPort {
    abstract recordSent(kind: TelegramMessageKind): void;

    abstract recordSendError(reason: TelegramSendErrorReason): void;
}
