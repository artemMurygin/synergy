import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '../generated/prisma/client';
import type { Env } from '../config/env.schema';

/** Клиент внешней MSSQL. Соединение устанавливается лениво, при первом запросе. */
@Injectable()
export class MssqlService extends PrismaClient implements OnModuleDestroy {
    constructor(config: ConfigService<Env, true>) {
        super({ adapter: new PrismaMssql(config.get('MSSQL_URL', { infer: true })) });
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }
}
