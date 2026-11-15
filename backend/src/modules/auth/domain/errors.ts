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
    Forbidden: 'FORBIDDEN',
    LastAdmin: 'LAST_ADMIN',
    EmailTaken: 'EMAIL_TAKEN',
    LoginTaken: 'LOGIN_TAKEN',
    DepartmentNameTaken: 'DEPARTMENT_NAME_TAKEN',
    DepartmentNotEmpty: 'DEPARTMENT_NOT_EMPTY',
    EmployeeNotFound: 'EMPLOYEE_NOT_FOUND',
    DepartmentNotFound: 'DEPARTMENT_NOT_FOUND',
    ProfileIncomplete: 'PROFILE_INCOMPLETE',
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

export class ForbiddenError extends BaseError {
    readonly code = AuthErrorCode.Forbidden;

    constructor() {
        super('Insufficient role');
    }
}

export class LastAdminError extends BaseError {
    readonly code = AuthErrorCode.LastAdmin;

    constructor() {
        super('The system must keep at least one active admin');
    }
}

export class EmailTakenError extends BaseError {
    readonly code = AuthErrorCode.EmailTaken;

    constructor() {
        super('Email is already used by another employee');
    }
}

export class LoginTakenError extends BaseError {
    readonly code = AuthErrorCode.LoginTaken;

    constructor() {
        super('Login is already taken');
    }
}

export class DepartmentNameTakenError extends BaseError {
    readonly code = AuthErrorCode.DepartmentNameTaken;

    constructor() {
        super('Department name is already taken');
    }
}

export class DepartmentNotEmptyError extends BaseError {
    readonly code = AuthErrorCode.DepartmentNotEmpty;

    constructor() {
        super('Department still has employees');
    }
}

export class EmployeeNotFoundError extends BaseError {
    readonly code = AuthErrorCode.EmployeeNotFound;

    constructor() {
        super('Employee not found');
    }
}

export class DepartmentNotFoundError extends BaseError {
    readonly code = AuthErrorCode.DepartmentNotFound;

    constructor() {
        super('Department not found');
    }
}

export class ProfileIncompleteError extends BaseError {
    readonly code = AuthErrorCode.ProfileIncomplete;

    constructor() {
        super('The employee has no profile yet: last name and first name are required');
    }
}
