import { InvalidRetentionError } from './errors';

export { InvalidRetentionError } from './errors';

export interface RetentionProps {
    heldUntil: Date | null;
    expiresAt: Date | null;
}

/** Срок хранения: либо удержание до `heldUntil`, либо удаление в `expiresAt`. */
export class Retention {
    readonly heldUntil: Date | null;

    readonly expiresAt: Date | null;

    private constructor({ heldUntil, expiresAt }: RetentionProps) {
        if ((heldUntil === null) === (expiresAt === null)) {
            throw new InvalidRetentionError('Exactly one of heldUntil and expiresAt must be set');
        }
        assertValidDate(heldUntil);
        assertValidDate(expiresAt);
        this.heldUntil = heldUntil === null ? null : new Date(heldUntil.getTime());
        this.expiresAt = expiresAt === null ? null : new Date(expiresAt.getTime());
        Object.freeze(this);
    }

    static of(props: RetentionProps): Retention {
        return new Retention(props);
    }

    static heldUntil(until: Date): Retention {
        return new Retention({ heldUntil: until, expiresAt: null });
    }

    static expiring(at: Date): Retention {
        return new Retention({ heldUntil: null, expiresAt: at });
    }

    isHeld(): boolean {
        return this.heldUntil !== null;
    }

    equals(other: Retention): boolean {
        return (
            this.heldUntil?.getTime() === other.heldUntil?.getTime() &&
            this.expiresAt?.getTime() === other.expiresAt?.getTime()
        );
    }
}

function assertValidDate(value: Date | null): void {
    if (value !== null && Number.isNaN(value.getTime())) {
        throw new InvalidRetentionError('Retention date is invalid');
    }
}
