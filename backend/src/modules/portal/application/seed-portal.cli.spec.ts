import { describe, expect, it } from 'vitest';
import { PORTAL_CATALOG } from './portal-catalog';
import { formatPortalSeedReport, runSeedPortal } from './seed-portal.cli';
import { SeedPortalCatalogUseCase } from './seed-portal-catalog.use-case';
import { InMemoryCatalogRepository } from './test-doubles';

function io(): { stdout: string[]; stderr: string[]; sinks: Parameters<typeof runSeedPortal>[1] } {
    const stdout: string[] = [];
    const stderr: string[] = [];
    return {
        stdout,
        stderr,
        sinks: { stdout: (text) => stdout.push(text), stderr: (text) => stderr.push(text) },
    };
}

const expectedAgents = PORTAL_CATALOG.reduce((sum, product) => sum + product.agents.length, 0);

describe('formatPortalSeedReport', () => {
    it('prints the number of created products and agents', () => {
        expect(formatPortalSeedReport({ productsCreated: 4, agentsCreated: 6, skipped: [] })).toBe(
            'products created: 4\nagents created: 6',
        );
    });
});

describe('runSeedPortal: пропущенные записи', () => {
    it('печатает предупреждение о пропущенных записях и завершается с кодом 0', async () => {
        const catalog = new InMemoryCatalogRepository();
        catalog.addProduct('my-cc', 'Control Center');
        const out = io();

        const code = await runSeedPortal(new SeedPortalCatalogUseCase(catalog), out.sinks);

        expect(code).toBe(0);
        const warning = out.stderr.join('\n');
        expect(warning).toContain('control-center');
        expect(warning).toContain('Control Center');
    });
});

describe('runSeedPortal', () => {
    it('creates products and agents on the first run and nothing on the second', async () => {
        const catalog = new InMemoryCatalogRepository();
        const seed = new SeedPortalCatalogUseCase(catalog);

        const first = io();
        expect(await runSeedPortal(seed, first.sinks)).toBe(0);
        expect(catalog.products.size).toBe(PORTAL_CATALOG.length);
        expect(catalog.agents.size).toBe(expectedAgents);
        expect(first.stdout.join('\n')).toContain(
            `products created: ${String(PORTAL_CATALOG.length)}`,
        );

        const second = io();
        expect(await runSeedPortal(seed, second.sinks)).toBe(0);
        expect(catalog.products.size).toBe(PORTAL_CATALOG.length);
        expect(catalog.agents.size).toBe(expectedAgents);
        expect(second.stdout.join('\n')).toContain('products created: 0');
        expect(second.stdout.join('\n')).toContain('agents created: 0');
    });

    it('returns a non-zero exit code and reports to stderr when the database fails', async () => {
        const catalog = new InMemoryCatalogRepository();
        catalog.seed = () => Promise.reject(new Error('connection refused'));
        const out = io();

        const code = await runSeedPortal(new SeedPortalCatalogUseCase(catalog), out.sinks);

        expect(code).not.toBe(0);
        expect(out.stderr.join('\n')).toContain('connection refused');
        expect(out.stdout).toEqual([]);
    });
});
