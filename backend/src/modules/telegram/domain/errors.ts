import { ArgumentInvalidError, BaseError } from '../../../shared/errors';

export const TelegramErrorCode = {
    InvalidLinkToken: 'TELEGRAM_INVALID_LINK_TOKEN',
    AccountTaken: 'TELEGRAM_ACCOUNT_TAKEN',
    NotLinked: 'TELEGRAM_NOT_LINKED',
    NotConfigured: 'TELEGRAM_NOT_CONFIGURED',
    IdentityMismatch: 'TELEGRAM_IDENTITY_MISMATCH',
} as const;

export class InvalidLinkTokenError extends BaseError {
    readonly code = TelegramErrorCode.InvalidLinkToken;

    constructor() {
        super('Link token is invalid, expired or already used');
    }
}

export class TelegramAccountTakenError extends BaseError {
    readonly code = TelegramErrorCode.AccountTaken;

    constructor(cause?: Error) {
        super('Telegram account is already linked to another user', cause);
    }
}

export class TelegramNotLinkedError extends BaseError {
    readonly code = TelegramErrorCode.NotLinked;

    constructor() {
        super('Telegram account is not linked');
    }
}

export class TelegramNotConfiguredError extends BaseError {
    readonly code = TelegramErrorCode.NotConfigured;

    constructor() {
        super('Telegram bot is not configured');
    }
}

export class TelegramIdentityMismatchError extends BaseError {
    readonly code = TelegramErrorCode.IdentityMismatch;

    constructor() {
        super('Telegram link can be renewed only for the same Telegram user');
    }
}

export class InvalidTelegramIdentityError extends ArgumentInvalidError {}

export class InvalidLinkTokenSettingsError extends ArgumentInvalidError {}
