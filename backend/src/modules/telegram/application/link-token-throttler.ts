import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { LinkTokenRateLimitedError } from './errors';
import { RequestRateCounterPort } from './ports/request-rate-counter.port';

export const LINK_TOKEN_REQUESTS_PER_WINDOW = 10;
export const LINK_TOKEN_WINDOW_MS = 60_000;

const MS_IN_SECOND = 1000;
const MIN_RETRY_AFTER_SECONDS = 1;

@Injectable()
export class LinkTokenThrottler {
    constructor(
        private readonly counter: RequestRateCounterPort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(LinkTokenThrottler.name);
    }

    async acquire(userId: string): Promise<void> {
        let rate;
        try {
            rate = await this.counter.increment(`link-token:${userId}`, LINK_TOKEN_WINDOW_MS);
        } catch (error: unknown) {
            this.logger.error(
                { err: error },
                'Telegram rate counter unavailable, limit not enforced',
            );
            return;
        }
        if (rate.count <= LINK_TOKEN_REQUESTS_PER_WINDOW) return;
        throw new LinkTokenRateLimitedError(
            Math.max(MIN_RETRY_AFTER_SECONDS, Math.ceil(rate.retryAfterMs / MS_IN_SECOND)),
        );
    }
}
