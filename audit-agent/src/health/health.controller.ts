import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { DatabasePool, sql } from 'slonik';
import { PG_POOL } from '../database/database.constants';
import { MssqlService } from '../mssql/mssql.service';

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
    check() {
        return this.health.check([
            async () => {
                await this.pg.query(sql.unsafe`SELECT 1`);
                return { postgres: { status: 'up' as const } };
            },
            async () => {
                await this.mssql.$queryRaw`SELECT 1`;
                return { mssql: { status: 'up' as const } };
            },
        ]);
    }
}
