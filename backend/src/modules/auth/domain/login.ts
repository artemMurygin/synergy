export const MAX_LOGIN_LENGTH = 64;

export class InvalidLoginError extends Error {}

/** Login: trimmed, lower-cased, 1-64 characters. */
export class Login {
    private constructor(readonly value: string) {}

    static of(raw: string): Login {
        const value = raw.trim().toLowerCase();
        if (value.length === 0) throw new InvalidLoginError('Login must not be empty');
        if (value.length > MAX_LOGIN_LENGTH) {
            throw new InvalidLoginError(
                `Login is longer than ${String(MAX_LOGIN_LENGTH)} characters`,
            );
        }
        return new Login(value);
    }

    equals(other: Login): boolean {
        return this.value === other.value;
    }
}
