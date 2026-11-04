import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type {
    ProgramsSyncLogEntry,
    ProgramsSyncLoggerPort,
} from '../../application/ports/programs-etl.ports';
import { toPhaseLogFields } from './programs-sync-log-fields';

@Injectable()
export class PinoProgramsSyncLogger implements ProgramsSyncLoggerPort {
    constructor(private readonly logger: PinoLogger) {
        this.logger.setContext(PinoProgramsSyncLogger.name);
    }

    log(entry: ProgramsSyncLogEntry): void {
        const fields = toPhaseLogFields(entry);
        if (entry.outcome === 'failure') this.logger.warn(fields, 'Programs ETL phase failed');
        else this.logger.info(fields, 'Programs ETL phase done');
    }
}
