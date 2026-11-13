import { UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../auth/interface/http/decorators';

/** Глобальный JwtAuthGuard всегда кладёт пользователя; здесь только сужение типа. */
export function userOf(user: AuthenticatedUser | undefined): AuthenticatedUser {
    if (user === undefined) throw new UnauthorizedException();
    return user;
}
