import { HttpStatus } from '@nestjs/common';
import { registerErrorStatuses } from '../../../shared/http/error-status.registry';
import { TelegramRequestErrorCode } from '../application/errors';
import { TelegramErrorCode } from '../domain/errors';

export function registerTelegramErrorStatuses(): void {
    registerErrorStatuses({
        [TelegramErrorCode.NotConfigured]: HttpStatus.SERVICE_UNAVAILABLE,
        [TelegramErrorCode.NotLinked]: HttpStatus.NOT_FOUND,
        [TelegramRequestErrorCode.RateLimited]: HttpStatus.TOO_MANY_REQUESTS,
    });
}
