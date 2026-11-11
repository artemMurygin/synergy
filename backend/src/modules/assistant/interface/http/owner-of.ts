import { UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../auth/interface/http/decorators';

/** The id of the authenticated user; a request without one is rejected with 401. */
export function ownerOf(user: AuthenticatedUser | undefined): string {
    if (user === undefined) throw new UnauthorizedException();
    return user.id;
}
