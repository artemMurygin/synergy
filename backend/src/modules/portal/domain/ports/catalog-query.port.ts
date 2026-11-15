import type { SkillStatus } from '../skill-status';

export interface ProductRef {
    id: string;
    slug: string;
    name: string;
}

export interface CatalogAgentRow {
    id: string;
    slug: string;
    name: string;
}

export interface CatalogSkillRow {
    id: string;
    name: string;
    description: string;
    status: SkillStatus;
    statusChangedAt: Date;
    launchedAt: Date | null;
}

/**
 * Плоская строка каталога (LEFT JOIN продукт → агент → навык).
 * `agent` = null у продукта без агентов, `skill` = null у агента без навыков.
 * Агент из нескольких продуктов приходит отдельной строкой в каждом.
 */
export interface CatalogRow {
    product: ProductRef;
    agent: CatalogAgentRow | null;
    skill: CatalogSkillRow | null;
}

export interface ArchivedAgentRow {
    id: string;
    name: string;
    products: ProductRef[];
    /** Навыки без собственного архива: вернутся вместе с агентом. */
    skillsCount: number;
    archivedAt: Date;
}

export interface ArchivedSkillRow {
    id: string;
    name: string;
    agent: { id: string; name: string };
    products: ProductRef[];
    status: SkillStatus;
    archivedAt: Date;
}

export interface ArchiveRows {
    agents: ArchivedAgentRow[];
    skills: ArchivedSkillRow[];
}

export abstract class CatalogQuery {
    /**
     * Видимый каталог одним запросом: все продукты (в т.ч. без агентов), неархивные агенты,
     * навыки с `archived_at IS NULL` у навыка и агента. Сортировка: продукты и агенты по slug, навыки по названию.
     */
    abstract loadVisible(): Promise<CatalogRow[]>;
    abstract loadArchive(): Promise<ArchiveRows>;
}
