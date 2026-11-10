import { ValueObject } from '../../ddd';
import { ArgumentInvalidError } from '../../errors';

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [
    SECOND_MS,
    5 * SECOND_MS,
    30 * SECOND_MS,
    2 * MINUTE_MS,
    10 * MINUTE_MS,
];

interface RetryPolicyProps {
    readonly delaysMs: readonly number[];
    readonly maxAttempts: number;
}

export class RetryPolicy extends ValueObject<RetryPolicyProps> {
    static create(settings: { maxAttempts: number; delaysMs?: readonly number[] }): RetryPolicy {
        return new RetryPolicy({
            maxAttempts: settings.maxAttempts,
            delaysMs: [...(settings.delaysMs ?? DEFAULT_RETRY_DELAYS_MS)],
        });
    }

    get maxAttempts(): number {
        return this.props.maxAttempts;
    }

    nextAttemptAt(attempt: number, now: Date): Date {
        this.assertAttempt(attempt);
        const delays = this.props.delaysMs;
        const delayMs = delays[Math.min(attempt, delays.length) - 1] ?? 0;
        return new Date(now.getTime() + delayMs);
    }

    isExhausted(attempt: number): boolean {
        this.assertAttempt(attempt);
        return attempt >= this.props.maxAttempts;
    }

    protected validate(props: RetryPolicyProps): void {
        if (!Number.isInteger(props.maxAttempts) || props.maxAttempts < 1) {
            throw new ArgumentInvalidError('maxAttempts must be a positive integer');
        }
        if (props.delaysMs.length === 0) {
            throw new ArgumentInvalidError('delaysMs must not be empty');
        }
        let previousDelayMs = 0;
        for (const delayMs of props.delaysMs) {
            if (!Number.isInteger(delayMs) || delayMs < 0) {
                throw new ArgumentInvalidError('delaysMs must contain non-negative integers');
            }
            if (delayMs < previousDelayMs) {
                throw new ArgumentInvalidError('delaysMs must not decrease');
            }
            previousDelayMs = delayMs;
        }
    }

    private assertAttempt(attempt: number): void {
        if (!Number.isInteger(attempt) || attempt < 1) {
            throw new ArgumentInvalidError('attempt must be a positive integer');
        }
    }
}
