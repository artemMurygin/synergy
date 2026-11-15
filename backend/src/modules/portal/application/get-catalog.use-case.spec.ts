import { describe, expect, it } from 'vitest';
import {
    CatalogQuery,
    type ArchiveRows,
    type CatalogRow,
    type ProductDepartmentRow,
} from '../domain/ports/catalog-query.port';
import { GetCatalogUseCase } from './get-catalog.use-case';

class FakeCatalogQuery extends CatalogQuery {
    constructor(private readonly rows: CatalogRow[]) {
        super();
    }

    loadVisible(): Promise<CatalogRow[]> {
        return Promise.resolve(this.rows);
    }

    loadArchive(): Promise<ArchiveRows> {
        return Promise.reject(new Error('not used'));
    }

    loadProductDepartments(): Promise<ProductDepartmentRow[]> {
        return Promise.resolve([]);
    }
}

const bot = { id: 'p-bot', slug: 'bot', name: 'Бот' };
const cc = { id: 'p-cc', slug: 'control-center', name: 'Control Center' };
const web = { id: 'p-web', slug: 'web', name: 'Веб' };
const assistant = { id: 'a-1', slug: 'assistant', name: 'Ассистент' };
const tasks = { id: 'a-2', slug: 'tasks', name: 'Задачи' };

const at = new Date('2026-02-01T10:00:00Z');
const launchedAt = new Date('2026-01-15T10:00:00Z');

function skill(
    id: string,
    status: 'planned' | 'testing' | 'launched' | 'rework',
    launched: Date | null,
): CatalogRow['skill'] {
    return {
        id,
        name: `Навык ${id}`,
        description: 'Описание',
        status,
        statusChangedAt: at,
        launchedAt: launched,
    };
}

function build(rows: CatalogRow[]): GetCatalogUseCase {
    return new GetCatalogUseCase(new FakeCatalogQuery(rows));
}

describe('GetCatalogUseCase', () => {
    it('агент из двух продуктов попадает в обе ветки с одинаковыми навыками, статусом и полным списком products', async () => {
        const planned = skill('s1', 'planned', null);
        const launched = skill('s2', 'launched', launchedAt);
        const rows: CatalogRow[] = [
            { product: bot, agent: assistant, skill: planned },
            { product: bot, agent: assistant, skill: launched },
            { product: cc, agent: assistant, skill: planned },
            { product: cc, agent: assistant, skill: launched },
        ];

        const view = await build(rows).execute();

        expect(view.products.map((p) => p.slug)).toEqual(['bot', 'control-center']);
        const [inBot, inCc] = view.products.map((p) => p.agents[0]);
        expect(inBot).toEqual(inCc);
        expect(inBot).toMatchObject({
            id: 'a-1',
            status: { code: 'working', label: 'Работает' },
            products: [
                { id: 'p-bot', slug: 'bot', name: 'Бот' },
                { id: 'p-cc', slug: 'control-center', name: 'Control Center' },
            ],
        });
        expect(inBot.skills.map((s) => s.id)).toEqual(['s1', 's2']);
    });

    it('агент без запущенных навыков в статусе in_development', async () => {
        const view = await build([
            { product: web, agent: tasks, skill: skill('s1', 'testing', null) },
        ]).execute();

        expect(view.products[0]?.agents[0]?.status).toEqual({
            code: 'in_development',
            label: 'В разработке',
        });
    });

    it('статус working сохраняется при навыке в rework, если он когда-то запускался', async () => {
        const view = await build([
            { product: web, agent: tasks, skill: skill('s1', 'rework', launchedAt) },
        ]).execute();

        expect(view.products[0]?.agents[0]?.status.code).toBe('working');
    });

    it('навыки получают nextStatuses из SkillStatus.allowedNext', async () => {
        const view = await build([
            { product: web, agent: tasks, skill: skill('s1', 'testing', null) },
            { product: web, agent: tasks, skill: skill('s2', 'launched', launchedAt) },
        ]).execute();

        const skills = view.products[0]?.agents[0]?.skills;
        expect(skills[0]).toMatchObject({
            id: 's1',
            description: 'Описание',
            status: 'testing',
            statusChangedAt: at,
            nextStatuses: ['launched', 'rework'],
        });
        expect(skills[1].nextStatuses).toEqual(['rework']);
    });

    it('продукт без агентов и агент без навыков дают пустые списки', async () => {
        const view = await build([
            { product: bot, agent: null, skill: null },
            { product: web, agent: tasks, skill: null },
        ]).execute();

        expect(view.products[0]).toMatchObject({ slug: 'bot', agents: [] });
        expect(view.products[1]?.agents[0]).toMatchObject({ skills: [] });
    });

    it('пустой каталог — пустой список продуктов', async () => {
        expect(await build([]).execute()).toEqual({ products: [] });
    });
});
