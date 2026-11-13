import type { CatalogSeedProduct } from '../domain/ports/catalog-repository.port';

/**
 * Начальный состав каталога (design.md п. 9). Живёт в коде, а не в env: меняется редко и
 * должен проходить ревью. `slug` фиксированы: по ним сидер идемпотентен.
 */
export const PORTAL_CATALOG: readonly CatalogSeedProduct[] = [
    {
        slug: 'control-center',
        name: 'Control Center',
        agents: [
            { slug: 'assistant', name: 'Ассистент' },
            { slug: 'tasks', name: 'Задачи' },
            { slug: 'meetings', name: 'Встречи' },
            { slug: 'prices', name: 'Цены' },
        ],
    },
    {
        slug: 'manager-helper',
        name: 'Manager Helper',
        agents: [{ slug: 'deal-audit', name: 'Аудит сделок' }],
    },
    {
        slug: 'telegram-bot',
        name: 'Telegram-бот',
        agents: [{ slug: 'telegram-tasks', name: 'Агент задач' }],
    },
    { slug: 'web', name: 'Веб', agents: [] },
];
