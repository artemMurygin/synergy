import { Module } from '@nestjs/common';
import { PostgresModule } from '../../database/postgres/postgres.module';
import { AppConfigModule } from '../../shared/config/app-config.module';
import { AppLoggerModule } from '../../shared/logger/app-logger.module';
import { SeedPortalCatalogUseCase } from './application/seed-portal-catalog.use-case';
import { CatalogRepository } from './domain/ports/catalog-repository.port';
import { SlonikCatalogRepository } from './infrastructure/slonik-catalog.repository';

/** Минимальный модуль для CLI `seed:portal`: только БД и сидер каталога, без HTTP и outbox. */
@Module({
    imports: [AppConfigModule, AppLoggerModule, PostgresModule],
    providers: [
        { provide: CatalogRepository, useClass: SlonikCatalogRepository },
        SeedPortalCatalogUseCase,
    ],
})
export class PortalSeedModule {}
