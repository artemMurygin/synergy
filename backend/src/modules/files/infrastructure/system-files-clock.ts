import { Injectable } from '@nestjs/common';
import { FilesClockPort } from '../domain/ports/clock.port';

@Injectable()
export class SystemFilesClock extends FilesClockPort {
    now(): Date {
        return new Date();
    }
}
