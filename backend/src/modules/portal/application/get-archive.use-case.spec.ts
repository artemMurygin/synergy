import { describe, expect, it } from 'vitest';
import {
    CatalogQuery,
    type ArchiveRows,
    type CatalogRow,
} from '../domain/ports/catalog-query.port';
import { GetArchiveUseCase } from './get-archive.use-case';

class FakeCatalogQuery extends CatalogQuery {
    constructor(private readonly archive: ArchiveRows) {
        super();
    }

    loadVisible(): Promise<CatalogRow[]> {
        return Promise.reject(new Error('not used'));
    }

    loadArchive(): Promise<ArchiveRows> {
        return Promise.resolve(this.archive);
    }
}

const web = { id: 'p1', slug: 'web', name: 'Веб' };
const bot = { id: 'p2', slug: 'bot', name: 'Бот' };

describe('GetArchiveUseCase', () => {
    it('возвращает архивных агентов и навыки из loadArchive', async () => {
        const archive: ArchiveRows = {
            agents: [
                {
                    id: 'a1',
                    name: 'Ассистент',
                    products: [bot, web],
                    skillsCount: 3,
                    archivedAt: new Date('2026-03-01T10:00:00Z'),
                },
            ],
            skills: [
                {
                    id: 's1',
                    name: 'Напоминания',
                    agent: { id: 'a2', name: 'Задачи' },
                    products: [web],
                    status: 'launched',
                    archivedAt: new Date('2026-03-02T10:00:00Z'),
                },
            ],
        };

        const view = await new GetArchiveUseCase(new FakeCatalogQuery(archive)).execute();

        expect(view).toEqual(archive);
    });

    it('пустой архив даёт пустые списки', async () => {
        const view = await new GetArchiveUseCase(
            new FakeCatalogQuery({ agents: [], skills: [] }),
        ).execute();

        expect(view).toEqual({ agents: [], skills: [] });
    });
});
