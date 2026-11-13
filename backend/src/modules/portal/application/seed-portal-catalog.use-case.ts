import { Injectable } from '@nestjs/common';
import { CatalogRepository, type CatalogSeedResult } from '../domain/ports/catalog-repository.port';
import { PORTAL_CATALOG } from './portal-catalog';

/** Идемпотентно заводит продукты и агентов; существующие записи не перезаписываются. */
@Injectable()
export class SeedPortalCatalogUseCase {
    constructor(private readonly catalog: CatalogRepository) {}

    execute(): Promise<CatalogSeedResult> {
        return this.catalog.seed(PORTAL_CATALOG);
    }
}
