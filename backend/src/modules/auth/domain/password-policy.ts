import type { Login } from './login';

export type Violation = 'too-short' | 'no-letter' | 'no-digit' | 'same-as-login';

export const MIN_PASSWORD_LENGTH = 10;

export const PasswordPolicy = {
    /** Empty array means the password is acceptable. */
    validate(plain: string, login: Login): Violation[] {
        const violations: Violation[] = [];
        if (plain.length < MIN_PASSWORD_LENGTH) violations.push('too-short');
        if (!/\p{L}/u.test(plain)) violations.push('no-letter');
        if (!/\d/.test(plain)) violations.push('no-digit');
        if (plain.trim().toLowerCase() === login.value) violations.push('same-as-login');
        return violations;
    },
};
