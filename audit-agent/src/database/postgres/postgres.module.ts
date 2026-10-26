import { Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPool, DatabasePool } from 'slonik';
import type { Env } from '../../shared/config/env.schema';
import { PG_POOL } from './database.constants';
import { migrate } from './migrator';

@Injectable()
class PoolLifecycle implements OnApplicationShutdown {
    constructor(@Inject(PG_POOL) private readonly pool: DatabasePool) {}

    async onApplicationShutdown(): Promise<void> {
        await this.pool.end();
    }
}

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
    ],
    exports: [PG_POOL],
})
export class PostgresModule {}
