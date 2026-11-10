import { Injectable } from '@nestjs/common';
import { NotificationClockPort } from '../domain/ports/notification-clock.port';

@Injectable()
export class NotificationClock extends NotificationClockPort {
    now(): Date {
        return new Date();
    }
}
