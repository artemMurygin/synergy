import { HttpStatus } from '@nestjs/common';
import { registerErrorStatuses } from '../../../shared/http/error-status.registry';
import { NotificationErrorCode } from '../domain/errors';

export function registerNotificationErrorStatuses(): void {
    registerErrorStatuses({
        [NotificationErrorCode.NotificationNotFound]: HttpStatus.NOT_FOUND,
    });
}
