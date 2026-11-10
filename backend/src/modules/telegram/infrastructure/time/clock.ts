import { Injectable } from '@nestjs/common';
import { ClockPort } from '../../domain/ports/clock.port';

@Injectable()
export class Clock extends ClockPort {
    now(): Date {
        return new Date();
    }
}
