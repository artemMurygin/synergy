import { Module } from '@nestjs/common';
import { PostgresModule } from '../../../database/postgres/postgres.module';
import {
    CATALOG_QUERY_PORT,
    CATALOG_WRITER_PORT,
    SOURCE_STATE_REPOSITORY_PORT,
    SYNC_RUN_STORE_PORT,
} from '../programs-etl.tokens';
import { CatalogWriterRepository } from './catalog-writer-repository';
import { PostgresCatalogQueryRepository } from './postgres-catalog-query-repository';
import { PostgresSourceStateRepository } from './postgres-source-state-repository';
import { PostgresSyncRunStore } from './postgres-sync-run-store';

@Module({
    imports: [PostgresModule],
    providers: [
        { provide: CATALOG_QUERY_PORT, useClass: PostgresCatalogQueryRepository },
        { provide: CATALOG_WRITER_PORT, useClass: CatalogWriterRepository },
        { provide: SOURCE_STATE_REPOSITORY_PORT, useClass: PostgresSourceStateRepository },
        { provide: SYNC_RUN_STORE_PORT, useClass: PostgresSyncRunStore },
    ],
    exports: [
        CATALOG_QUERY_PORT,
        CATALOG_WRITER_PORT,
        SOURCE_STATE_REPOSITORY_PORT,
        SYNC_RUN_STORE_PORT,
    ],
})
export class ProgramsEtlPersistenceModule {}
