export const MAX_EMAIL_LENGTH = 254;

export class InvalidEmailError extends Error {}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Email: trimmed, lower-cased, valid format, up to 254 characters. */
export class Email {
    private constructor(readonly value: string) {}

    static of(raw: string): Email {
        const value = raw.trim().toLowerCase();
        if (value.length > MAX_EMAIL_LENGTH) {
            throw new InvalidEmailError(
                `Email is longer than ${String(MAX_EMAIL_LENGTH)} characters`,
            );
        }
        if (!EMAIL_PATTERN.test(value)) throw new InvalidEmailError('Email format is invalid');
        return new Email(value);
    }

    /** An empty or missing value means "no email". */
    static optional(raw: string | null | undefined): Email | undefined {
        if (raw === null || raw === undefined || raw.trim().length === 0) return undefined;
        return Email.of(raw);
    }

    equals(other: Email): boolean {
        return this.value === other.value;
    }
}
