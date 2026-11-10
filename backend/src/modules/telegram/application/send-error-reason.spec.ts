import { describe, expect, it } from 'vitest';
import {
    PermanentDeliveryError,
    RetryLaterDeliveryError,
} from '../../../shared/outbox/domain/delivery-errors';
import { ChatUnavailableError, TransientDeliveryError } from './errors';
import { sendErrorReasonOf } from './send-error-reason';

describe('sendErrorReasonOf', () => {
    it.each([
        [new TransientDeliveryError('network'), 'transient'],
        [new RetryLaterDeliveryError('429', 5000), 'rate_limited'],
        [new ChatUnavailableError('blocked'), 'chat_unavailable'],
        [new PermanentDeliveryError('400'), 'permanent'],
        [new Error('bug'), 'unknown'],
    ])('classifies %s', (error, reason) => {
        expect(sendErrorReasonOf(error)).toBe(reason);
    });
});
