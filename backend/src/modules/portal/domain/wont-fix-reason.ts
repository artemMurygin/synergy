import { ArgumentInvalidError } from '../../../shared/errors';

export const MAX_WONT_FIX_REASON_LENGTH = 2000;

export class InvalidWontFixReasonError extends ArgumentInvalidError {}

/** Причина «не будет исправлен»: обрезанная, 1-2000 символов. */
export class WontFixReason {
    private constructor(readonly value: string) {}

    static of(raw: string): WontFixReason {
        const value = raw.trim();
        if (value.length === 0) {
            throw new InvalidWontFixReasonError("Won't-fix reason must not be empty");
        }
        if (value.length > MAX_WONT_FIX_REASON_LENGTH) {
            throw new InvalidWontFixReasonError(
                `Won't-fix reason is longer than ${String(MAX_WONT_FIX_REASON_LENGTH)} characters`,
            );
        }
        return new WontFixReason(value);
    }
}
