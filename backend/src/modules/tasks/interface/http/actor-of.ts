import { UnauthorizedException } from '@nestjs/common';
import { Actor } from '../../domain/actor';
import type { AuthenticatedUser } from '../../../auth/interface/http/decorators';

/** The global JwtAuthGuard always sets the user; this only narrows the type. */
export function actorOf(user: AuthenticatedUser | undefined): Actor {
    if (user === undefined) throw new UnauthorizedException();
    return Actor.of(user.id);
}
