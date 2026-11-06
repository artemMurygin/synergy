/** Plain password; never logged or serialized. */
export class PlainPassword {
    private constructor(readonly value: string) {}

    static of(value: string): PlainPassword {
        return new PlainPassword(value);
    }

    toJSON(): string {
        return '[redacted]';
    }

    toString(): string {
        return '[redacted]';
    }
}
