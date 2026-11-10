import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../errors';
import { PermanentDeliveryError, RetryLaterDeliveryError } from './delivery-errors';

describe('subscriber delivery errors', () => {
    it('keeps the message and cause of a permanent error', () => {
        const cause = new Error('bad request');

        const failure = new PermanentDeliveryError('message rejected', cause);

        expect(failure).toBeInstanceOf(Error);
        expect(failure.message).toBe('message rejected');
        expect(failure.cause).toBe(cause);
        expect(failure.code).toBe('OUTBOX.PERMANENT_DELIVERY_FAILURE');
    });

    it('keeps the pause asked by the subscriber', () => {
        const failure = new RetryLaterDeliveryError('too many requests', 5_000);

        expect(failure.retryAfterMs).toBe(5_000);
        expect(failure.code).toBe('OUTBOX.RETRY_LATER');
    });

    it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
        'rejects the pause %s',
        (retryAfterMs) => {
            expect(() => new RetryLaterDeliveryError('too many requests', retryAfterMs)).toThrow(
                ArgumentInvalidError,
            );
        },
    );
});
