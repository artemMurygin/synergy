import { InvalidRejectReasonError } from './errors';

export const MAX_REJECT_REASON_LENGTH = 2000;

/** Причина отклонения заявки: обрезанная, 1-2000 символов. */
export class RejectReason {
    private constructor(readonly value: string) {}

    static of(raw: string): RejectReason {
        const value = raw.trim();
        if (value.length === 0) {
            throw new InvalidRejectReasonError('Reject reason must not be empty');
        }
        if (value.length > MAX_REJECT_REASON_LENGTH) {
            throw new InvalidRejectReasonError(
                `Reject reason is longer than ${String(MAX_REJECT_REASON_LENGTH)} characters`,
            );
        }
        return new RejectReason(value);
    }
}
