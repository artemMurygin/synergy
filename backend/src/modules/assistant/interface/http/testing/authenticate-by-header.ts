import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../../../../auth/interface/http/decorators';

export const TEST_USER = 'user-1';
export const OTHER_TEST_USER = 'user-2';
export const USER_HEADER = 'x-test-user';
export const ANONYMOUS = 'anonymous';

/** Stands in for the global auth guard in controller specs: the user comes from a header. */
export function authenticateByHeader(
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction,
): void {
    const id = req.header(USER_HEADER) ?? TEST_USER;
    if (id !== ANONYMOUS) {
        req.authUser = { id, sessionId: 's', mustChangePassword: false, roles: [] };
    }
    next();
}
