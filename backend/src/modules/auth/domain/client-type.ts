export type ClientType = 'cookie' | 'desktop';

export class InvalidClientTypeError extends Error {}

export const ClientType = {
    /** Value of X-Client-Type; an absent header means a cookie client. */
    parse(raw: string | undefined): ClientType {
        if (raw === undefined) return 'cookie';
        if (raw === 'cookie' || raw === 'desktop') return raw;
        throw new InvalidClientTypeError(`Unknown client type: ${raw}`);
    },
};
