import { describe, expect, it } from 'vitest';
import { Agent } from '../domain/agent';
import { AgentNameTakenError, ProductNameTakenError, SlugTakenError } from '../domain/errors';
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

        expect(result).toEqual({ productsCreated: 4, agentsCreated: 6, skipped: [] });
        expect(catalog.products.size).toBe(4);
        expect(catalog.agents.size).toBe(6);
    });

    it('при повторном запуске ничего не создаёт и не перезаписывает записи', async () => {
        const catalog = new InMemoryCatalogRepository();
        const seed = new SeedPortalCatalogUseCase(catalog);
        await seed.execute();
        const before = new Map(catalog.agents);

        const second = await seed.execute();

        expect(second).toEqual({ productsCreated: 0, agentsCreated: 0, skipped: [] });
        expect(catalog.products.size).toBe(4);
        expect(catalog.agents.size).toBe(6);
        for (const [id, agent] of before) expect(catalog.agents.get(id)).toBe(agent);
    });

    describe('агент в нескольких продуктах', () => {
        const SHARED = [
            {
                slug: 'control-center',
                name: 'CC',
                agents: [{ slug: 'assistant', name: 'Ассистент' }],
            },
            {
                slug: 'telegram-bot',
                name: 'TG',
                agents: [{ slug: 'assistant', name: 'Ассистент' }],
            },
        ];

        it('агент с одним slug у двух продуктов — одна запись и две связи', async () => {
            const shared = await new InMemoryCatalogRepository().seed(SHARED);

            expect(shared).toEqual({ productsCreated: 2, agentsCreated: 1, skipped: [] });
        });

        it('связи агента с продуктами сохраняются в productIds', async () => {
            const catalog = new InMemoryCatalogRepository();

            await catalog.seed(SHARED);

            expect(catalog.agents.size).toBe(1);
            const [agent] = [...catalog.agents.values()];
            expect(agent.productIds).toEqual(['product-control-center', 'product-telegram-bot']);
        });

        it('повторный запуск добавляет недостающие связи и не меняет имя и archivedAt', async () => {
            const catalog = new InMemoryCatalogRepository();
            await catalog.seed([SHARED[0]]);
            const [first] = [...catalog.agents.values()];
            first.archive(new Date('2026-01-01T00:00:00Z'));
            const archivedAt = first.archivedAt;

            await catalog.seed([
                { ...SHARED[0], agents: [{ slug: 'assistant', name: 'Другое имя' }] },
                SHARED[1],
            ]);

            expect(catalog.agents.size).toBe(1);
            const [after] = [...catalog.agents.values()];
            expect(after.productIds).toEqual(['product-control-center', 'product-telegram-bot']);
            expect(after.name).toBe('Ассистент');
            expect(after.archivedAt).toEqual(archivedAt);
        });
    });
});

describe('SeedPortalCatalogUseCase: занятые названия', () => {
    it('пропускает продукт, чьё название занято записью с другим slug, вместе с его агентами', async () => {
        const catalog = new InMemoryCatalogRepository();
        catalog.addProduct('my-cc', ' control CENTER ');
        const seed = new SeedPortalCatalogUseCase(catalog);

        const result = await seed.execute();

        expect(result.skipped).toContainEqual({
            kind: 'product',
            slug: 'control-center',
            name: 'Control Center',
        });
        expect(catalog.products.has('control-center')).toBe(false);
        expect([...catalog.agents.values()].map((agent) => agent.slug)).not.toContain('assistant');
        expect(result.productsCreated).toBe(3);
    });

    it('пропускает агента, чьё название занято другим slug, и не создаёт связей', async () => {
        const catalog = new InMemoryCatalogRepository();
        catalog.addProduct('other', 'Other');
        catalog.addAgent('other', 'my-assistant', 'АССИСТЕНТ');

        const result = await new SeedPortalCatalogUseCase(catalog).execute();

        expect(result.skipped).toContainEqual({
            kind: 'agent',
            slug: expect.any(String) as string,
            name: 'Ассистент',
        });
        const taken = [...catalog.agents.values()].filter(
            (agent) => agent.name.toLowerCase() === 'ассистент',
        );
        expect(taken).toHaveLength(1);
        expect(taken[0]?.slug).toBe('my-assistant');
        expect(taken[0]?.productIds).toEqual(['product-other']);
    });

    it('повторный запуск не создаёт дублей и повторно сообщает о пропуске', async () => {
        const catalog = new InMemoryCatalogRepository();
        catalog.addProduct('my-cc', 'Control Center');
        const seed = new SeedPortalCatalogUseCase(catalog);
        const first = await seed.execute();
        const productsBefore = catalog.products.size;
        const agentsBefore = catalog.agents.size;

        const second = await seed.execute();

        expect(catalog.products.size).toBe(productsBefore);
        expect(catalog.agents.size).toBe(agentsBefore);
        expect(second.productsCreated).toBe(0);
        expect(second.agentsCreated).toBe(0);
        expect(second.skipped).toEqual(first.skipped);
    });
});

describe('InMemoryCatalogRepository: вставка и поиск', () => {
    it('nextFreeSlug возвращает base, а при занятом - первый свободный base-N', async () => {
        const catalog = new InMemoryCatalogRepository();
        expect(await catalog.nextFreeSlug('product', 'crm')).toBe('crm');
        catalog.addProduct('crm', 'CRM');
        catalog.addProduct('crm-2', 'CRM 2');
        expect(await catalog.nextFreeSlug('product', 'crm')).toBe('crm-3');
        expect(await catalog.nextFreeSlug('agent', 'crm')).toBe('crm');
    });

    it('insertProduct бросает ProductNameTakenError и SlugTakenError', async () => {
        const catalog = new InMemoryCatalogRepository();
        await catalog.insertProduct({ id: 'p1', slug: 'crm', name: 'CRM' });

        await expect(
            catalog.insertProduct({ id: 'p2', slug: 'other', name: ' crm ' }),
        ).rejects.toBeInstanceOf(ProductNameTakenError);
        await expect(
            catalog.insertProduct({ id: 'p3', slug: 'crm', name: 'Другое' }),
        ).rejects.toBeInstanceOf(SlugTakenError);
        expect((await catalog.findProductByName('crm'))?.id).toBe('p1');
    });

    it('insertAgent бросает AgentNameTakenError и SlugTakenError, находит по названию', async () => {
        const catalog = new InMemoryCatalogRepository();
        const make = (id: string, slug: string, name: string): Agent =>
            Agent.create({ id, slug, name, productIds: ['p1'], now: new Date() });
        await catalog.insertAgent(make('a1', 'bot', 'Бот'));

        await expect(catalog.insertAgent(make('a2', 'x', 'бот'))).rejects.toBeInstanceOf(
            AgentNameTakenError,
        );
        await expect(catalog.insertAgent(make('a3', 'bot', 'Иной'))).rejects.toBeInstanceOf(
            SlugTakenError,
        );
        expect((await catalog.findAgentByName('бот'))?.id).toBe('a1');
    });
});
