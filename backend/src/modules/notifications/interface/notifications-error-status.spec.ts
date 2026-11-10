import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { findErrorStatus } from '../../../shared/http/error-status.registry';
import { NotificationErrorCode } from '../domain/errors';
import { registerNotificationErrorStatuses } from './notifications-error-status';

describe('registerNotificationErrorStatuses', () => {
    it('maps a missing notification to 404', () => {
        registerNotificationErrorStatuses();

        expect(findErrorStatus(NotificationErrorCode.NotificationNotFound)).toBe(
            HttpStatus.NOT_FOUND,
        );
    });
});
