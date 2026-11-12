import { ArgumentOutOfRangeError } from '../../../shared/errors';
import type { FileKind } from './file-kind';
import { InvalidRetentionError, Retention } from './retention';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionSettings {
    documentDays: number;
    recordingDays: number;
    maxHoldDays: number;
}

/** Сроки хранения: документ — с загрузки, запись — с конца обработки, удержание ограничено. */
export class RetentionPolicy {
    private readonly settings: Readonly<RetentionSettings>;

    constructor(settings: RetentionSettings) {
        for (const [name, days] of Object.entries(settings)) {
            if (!Number.isFinite(days) || days <= 0) {
                throw new ArgumentOutOfRangeError(`${name} must be a positive number`);
            }
        }
        this.settings = Object.freeze({ ...settings });
    }

    initial(kind: FileKind, now: Date): Retention {
        return kind === 'document'
            ? Retention.expiring(addDays(now, this.settings.documentDays))
            : this.held(now);
    }

    held(now: Date): Retention {
        return Retention.heldUntil(addDays(now, this.settings.maxHoldDays));
    }

    released(now: Date): Retention {
        return Retention.expiring(addDays(now, this.settings.recordingDays));
    }

    /** Для зависшего удержания срок считается от его конца. */
    effectiveExpiry(retention: Retention): Date {
        const { expiresAt, heldUntil } = retention;
        if (expiresAt !== null) return expiresAt;
        // Недостижимо: Retention гарантирует ровно одно заданное поле.
        if (heldUntil === null) throw new InvalidRetentionError('Retention has no dates');
        return addDays(heldUntil, this.settings.recordingDays);
    }
}

function addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * DAY_MS);
}
