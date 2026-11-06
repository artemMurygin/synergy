import { BaseError } from '../../../shared/errors';

export const AuthErrorCode = {
    InvalidCredentials: 'INVALID_CREDENTIALS',
    TokenInvalid: 'TOKEN_INVALID',
    TokenExpired: 'TOKEN_EXPIRED',
    RefreshRace: 'REFRESH_RACE',
    PasswordChangeRequired: 'PASSWORD_CHANGE_REQUIRED',
    WrongPassword: 'WRONG_PASSWORD',
    SamePassword: 'SAME_PASSWORD',
    WeakPassword: 'WEAK_PASSWORD',
    RateLimited: 'RATE_LIMITED',
    ForbiddenOrigin: 'FORBIDDEN_ORIGIN',
    InvalidClientType: 'INVALID_CLIENT_TYPE',
} as const;

export class InvalidCredentialsError extends BaseError {
    readonly code = AuthErrorCode.InvalidCredentials;

    constructor() {
        super('Invalid login or password');
    }
}

export class InvalidRefreshTokenError extends BaseError {
    readonly code = AuthErrorCode.TokenInvalid;

    constructor() {
        super('Invalid refresh token');
    }
}

export class RefreshRaceError extends BaseError {
    readonly code = AuthErrorCode.RefreshRace;

    constructor() {
        super('Refresh token was just rotated by a concurrent request');
    }
}

export class PasswordChangeRequiredError extends BaseError {
    readonly code = AuthErrorCode.PasswordChangeRequired;

    constructor() {
        super('Password change required');
    }
}

export class WrongPasswordError extends BaseError {
    readonly code = AuthErrorCode.WrongPassword;

    constructor() {
        super('Current password is wrong');
    }
}

export class SamePasswordError extends BaseError {
    readonly code = AuthErrorCode.SamePassword;

    constructor() {
        super('New password must differ from the current one');
    }
}

export class WeakPasswordError extends BaseError {
    readonly code = AuthErrorCode.WeakPassword;

    constructor(readonly violations: string[]) {
        super('Password does not satisfy the policy');
    }
}

export class AccessTokenExpiredError extends BaseError {
    readonly code = AuthErrorCode.TokenExpired;

    constructor() {
        super('Access token expired');
    }
}

export class AccessTokenInvalidError extends BaseError {
    readonly code = AuthErrorCode.TokenInvalid;

    constructor() {
        super('Invalid access token');
    }
}

export class RateLimitedError extends BaseError {
    readonly code = AuthErrorCode.RateLimited;

    constructor(readonly retryAfterSeconds: number) {
        super('Too many attempts, try again later');
    }
}

export class ForbiddenOriginError extends BaseError {
    readonly code = AuthErrorCode.ForbiddenOrigin;

    constructor() {
        super('Origin is not allowed');
    }
}
