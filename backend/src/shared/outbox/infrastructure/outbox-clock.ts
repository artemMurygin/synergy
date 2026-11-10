import { Injectable } from '@nestjs/common';
import { OutboxClockPort } from '../application/outbox-clock.port';

@Injectable()
export class OutboxClock extends OutboxClockPort {
    now(): Date {
        return new Date();
    }
}
