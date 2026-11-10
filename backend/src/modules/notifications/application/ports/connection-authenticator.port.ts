import { BaseError } from '../../../../shared/errors';

export const CONNECTION_REJECTION_REASONS = [
    'token_invalid',
    'token_expired',
    'password_change_required',
    'origin_not_allowed',
] as const;

export type ConnectionRejectionReason = (typeof CONNECTION_REJECTION_REASONS)[number];

export class ConnectionRejectedError extends BaseError {
    readonly code = 'NOTIFICATIONS.CONNECTION_REJECTED';

    constructor(readonly reason: ConnectionRejectionReason) {
        super(`Realtime connection rejected: ${reason}`);
    }
}

export interface AuthenticatedConnection {
    readonly userId: string;
    readonly expiresAt: Date;
}

export abstract class ConnectionAuthenticatorPort {
    abstract authenticate(token: string): AuthenticatedConnection;
}
