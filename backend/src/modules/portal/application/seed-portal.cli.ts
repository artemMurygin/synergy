import type { CatalogSeedResult } from '../domain/ports/catalog-repository.port';

export interface SeedPortalSinks {
    stdout(text: string): void;
    stderr(text: string): void;
}

export function formatPortalSeedReport(result: CatalogSeedResult): string {
    return `products created: ${String(result.productsCreated)}\nagents created: ${String(result.agentsCreated)}`;
}

/** Запускает сидер каталога и возвращает код выхода процесса: 0 при успехе, 1 при ошибке. */
export async function runSeedPortal(
    seed: { execute(): Promise<CatalogSeedResult> },
    sinks: SeedPortalSinks,
): Promise<number> {
    try {
        const result = await seed.execute();
        sinks.stdout(`${formatPortalSeedReport(result)}\n`);
        return 0;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        sinks.stderr(`seed:portal failed: ${message}\n`);
        return 1;
    }
}
