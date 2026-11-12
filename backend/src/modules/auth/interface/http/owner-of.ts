import { UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedUser } from './decorators';

// Глобальный JwtAuthGuard всегда ставит пользователя; здесь только сужение типа.
export function ownerOf(user: AuthenticatedUser | undefined): string {
    if (user === undefined) throw new UnauthorizedException();
    return user.id;
}
