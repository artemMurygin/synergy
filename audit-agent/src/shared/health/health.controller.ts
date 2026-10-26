import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { DatabasePool, sql } from 'slonik';
import { PG_POOL } from '../../database/postgres/database.constants';
import { MssqlService } from '../../database/mssql/mssql.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
    constructor(
        private readonly health: HealthCheckService,
        @Inject(PG_POOL) private readonly pg: DatabasePool,
        private readonly mssql: MssqlService,
    ) {}

    @Get()
    @HealthCheck()
    check(): Promise<HealthCheckResult> {
        return this.health.check([
            () => {
                return { postgres: { status: 'up' as const } };
            },
            () => {
                return { mssql: { status: 'up' as const } };
            },
        ]);
    }
}
