import { describe, expect, it } from 'vitest';
import {
    BotApiConflictError,
    BotApiRateLimitedError,
    BotApiRejectedError,
    ChatUnavailableError,
    TransientDeliveryError,
} from './errors';
import { sendErrorReasonOf } from './send-error-reason';

describe('sendErrorReasonOf', () => {
    it.each([
        [new TransientDeliveryError('network'), 'transient'],
        [new BotApiRateLimitedError('429', 5000), 'rate_limited'],
        [new BotApiRateLimitedError('429', null), 'rate_limited'],
        [new ChatUnavailableError('blocked'), 'chat_unavailable'],
        [new BotApiRejectedError('400'), 'permanent'],
        [new BotApiConflictError('409'), 'permanent'],
        [new Error('bug'), 'unknown'],
    ])('classifies %s', (error, reason) => {
        expect(sendErrorReasonOf(error)).toBe(reason);
    });
});
