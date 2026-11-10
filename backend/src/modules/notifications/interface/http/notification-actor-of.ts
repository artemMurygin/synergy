import { UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../auth/interface/http/decorators';
import type { NotificationActor } from '../../application/notification-actor';

export function notificationActorOf(user: AuthenticatedUser | undefined): NotificationActor {
    if (user === undefined) throw new UnauthorizedException();
    return { userId: user.id };
}
