import { HttpStatus } from '@nestjs/common';
import { registerErrorStatuses } from '../../../shared/http/error-status.registry';
import { AuthErrorCode } from '../domain/errors';

export function registerAuthErrorStatuses(): void {
    registerErrorStatuses({
        [AuthErrorCode.InvalidCredentials]: HttpStatus.UNAUTHORIZED,
        [AuthErrorCode.TokenInvalid]: HttpStatus.UNAUTHORIZED,
        [AuthErrorCode.TokenExpired]: HttpStatus.UNAUTHORIZED,
        [AuthErrorCode.RefreshRace]: HttpStatus.CONFLICT,
        [AuthErrorCode.PasswordChangeRequired]: HttpStatus.FORBIDDEN,
        [AuthErrorCode.WrongPassword]: HttpStatus.UNPROCESSABLE_ENTITY,
        [AuthErrorCode.SamePassword]: HttpStatus.UNPROCESSABLE_ENTITY,
        [AuthErrorCode.WeakPassword]: HttpStatus.UNPROCESSABLE_ENTITY,
        [AuthErrorCode.RateLimited]: HttpStatus.TOO_MANY_REQUESTS,
        [AuthErrorCode.ForbiddenOrigin]: HttpStatus.FORBIDDEN,
        [AuthErrorCode.Forbidden]: HttpStatus.FORBIDDEN,
        [AuthErrorCode.LastAdmin]: HttpStatus.CONFLICT,
        [AuthErrorCode.EmailTaken]: HttpStatus.CONFLICT,
        [AuthErrorCode.LoginTaken]: HttpStatus.CONFLICT,
        [AuthErrorCode.DepartmentNameTaken]: HttpStatus.CONFLICT,
        [AuthErrorCode.DepartmentNotEmpty]: HttpStatus.CONFLICT,
        [AuthErrorCode.EmployeeNotFound]: HttpStatus.NOT_FOUND,
        [AuthErrorCode.DepartmentNotFound]: HttpStatus.NOT_FOUND,
        [AuthErrorCode.ProfileIncomplete]: HttpStatus.BAD_REQUEST,
    });
}
