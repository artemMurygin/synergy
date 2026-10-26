import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPool, DatabasePool } from 'slonik';
import type { Env } from '../config/env.schema';
import { PG_POOL } from './database.constants';
import { migrate } from './migrator';
import { AuditRunRepository } from './audit-run.repository';

@Injectable()
class PoolLifecycle implements OnApplicationShutdown {
    constructor(@Inject(PG_POOL) private readonly pool: DatabasePool) {}

    async onApplicationShutdown() {
        await this.pool.end();
    }
}

@Global()
@Module({
    providers: [
        {
            provide: PG_POOL,
            inject: [ConfigService],
            useFactory: async (config: ConfigService<Env, true>) => {
                const url = config.get('POSTGRES_URL', { infer: true });
                await migrate(url);
                return createPool(url);
            },
        },
        PoolLifecycle,
        AuditRunRepository,
    ],
    exports: [PG_POOL, AuditRunRepository],
})
export class DatabaseModule {}
