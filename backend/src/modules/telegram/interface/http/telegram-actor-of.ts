import { UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../auth/interface/http/decorators';
import type { TelegramActor } from '../../application/telegram-actor';

export function telegramActorOf(user: AuthenticatedUser | undefined): TelegramActor {
    if (user === undefined) throw new UnauthorizedException();
    return { userId: user.id };
}
