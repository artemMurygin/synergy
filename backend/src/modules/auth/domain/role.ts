export type Role = 'developer' | 'admin';

export class InvalidRoleError extends Error {}

const ALL: readonly Role[] = ['developer', 'admin'];

export const Role = {
    ALL,
    /** Closed set: an unknown value is rejected. */
    of(raw: unknown): Role {
        if (typeof raw === 'string' && (ALL as readonly string[]).includes(raw)) {
            return raw as Role;
        }
        throw new InvalidRoleError(`Unknown role: ${String(raw)}`);
    },
};
