import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { AccessTokenInvalidError, PasswordChangeRequiredError } from '../../domain/errors';
import { PasswordChangeGuard } from './password-change.guard';

function context(authUser: unknown): ExecutionContext {
    const target = (): void => undefined;
    return {
        getHandler: () => target,
        getClass: () => target,
        switchToHttp: () => ({ getRequest: () => ({ authUser }) }),
    } as unknown as ExecutionContext;
}

describe('PasswordChangeGuard', () => {
    const guard = new PasswordChangeGuard(new Reflector());

    it('fails closed when no user was authenticated before it', () => {
        expect(() => guard.canActivate(context(undefined))).toThrow(AccessTokenInvalidError);
    });

    it('blocks a user who must change the password', () => {
        const user = { id: 'u', sessionId: 's', mustChangePassword: true };
        expect(() => guard.canActivate(context(user))).toThrow(PasswordChangeRequiredError);
    });

    it('lets other users through', () => {
        const user = { id: 'u', sessionId: 's', mustChangePassword: false };
        expect(guard.canActivate(context(user))).toBe(true);
    });
});
