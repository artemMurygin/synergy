import { describe, expect, it } from 'vitest';
import { PORTAL_CATALOG } from './portal-catalog';
import { SeedPortalCatalogUseCase } from './seed-portal-catalog.use-case';
import { InMemoryCatalogRepository } from './test-doubles';

describe('PORTAL_CATALOG', () => {
    it('содержит продукты и агентов из design.md п. 9 с фиксированными slug', () => {
        expect(PORTAL_CATALOG.map((product) => product.slug)).toEqual([
            'control-center',
            'manager-helper',
            'telegram-bot',
            'web',
        ]);
        const names = (slug: string): string[] =>
            (PORTAL_CATALOG.find((product) => product.slug === slug)?.agents ?? []).map(
                (agent) => agent.name,
            );
        expect(names('control-center')).toEqual(['Ассистент', 'Задачи', 'Встречи', 'Цены']);
        expect(names('manager-helper')).toEqual(['Аудит сделок']);
        expect(names('telegram-bot')).toEqual(['Агент задач']);
        expect(names('web')).toEqual([]);
    });

    it('не повторяет slug агентов', () => {
        const slugs = PORTAL_CATALOG.flatMap((product) => product.agents.map((a) => a.slug));
        expect(new Set(slugs).size).toBe(slugs.length);
    });
});

describe('SeedPortalCatalogUseCase', () => {
    it('заводит продукты и агентов', async () => {
        const catalog = new InMemoryCatalogRepository();

        const result = await new SeedPortalCatalogUseCase(catalog).execute();

        expect(result).toEqual({ productsCreated: 4, agentsCreated: 6 });
        expect(catalog.products.size).toBe(4);
        expect(catalog.agents.size).toBe(6);
    });

    it('при повторном запуске ничего не создаёт и не перезаписывает записи', async () => {
        const catalog = new InMemoryCatalogRepository();
        const seed = new SeedPortalCatalogUseCase(catalog);
        await seed.execute();
        const before = new Map(catalog.agents);

        const second = await seed.execute();

        expect(second).toEqual({ productsCreated: 0, agentsCreated: 0 });
        expect(catalog.products.size).toBe(4);
        expect(catalog.agents.size).toBe(6);
        for (const [id, agent] of before) expect(catalog.agents.get(id)).toBe(agent);
    });
});
