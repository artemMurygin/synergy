import type { Agent } from '../agent';
import type { Product } from '../product';

export { SlugTakenError } from '../errors';

export interface AgentWithProducts {
    agent: Agent;
    /** Продукты агента, отсортированы по slug. */
    products: Product[];
}

export interface CatalogSeedProduct {
    slug: string;
    name: string;
    agents: { slug: string; name: string }[];
}

/** Запись сидера, пропущенная из-за того, что её название занято записью с другим `slug`. */
export interface CatalogSeedSkipped {
    kind: 'product' | 'agent';
    slug: string;
    name: string;
}

export interface CatalogSeedResult {
    productsCreated: number;
    agentsCreated: number;
    skipped: CatalogSeedSkipped[];
}

export type CatalogKind = 'agent' | 'product';

export abstract class CatalogRepository {
    /** Неархивные агенты, каждый один раз, вместе со списком продуктов. */
    abstract listAgents(): Promise<AgentWithProducts[]>;
    abstract findAgent(id: string): Promise<Agent | null>;
    /** Читает агента с `FOR SHARE` (действия над навыком); возвращает `archivedAt` и `productIds`. */
    abstract findAgentForShare(id: string): Promise<Agent | null>;
    /** Читает агента с `FOR UPDATE` (архивация/восстановление агента). */
    abstract findAgentForUpdate(id: string): Promise<Agent | null>;
    /** Продукты по идентификаторам, отсортированы по slug. */
    abstract findProductsByIds(ids: readonly string[]): Promise<Product[]>;
    /** Обновляет только `archived_at`. */
    abstract saveAgent(agent: Agent): Promise<void>;
    /** Агент по ключу названия `lower(btrim(name))`, включая архивных. */
    abstract findAgentByName(key: string): Promise<Agent | null>;
    /** Продукт по ключу названия `lower(btrim(name))`, включая архивных. */
    abstract findProductByName(key: string): Promise<Product | null>;
    /** `base`, а при занятом - первый свободный `base-N` (N >= 2); учитываются архивные. */
    abstract nextFreeSlug(kind: CatalogKind, base: string): Promise<string>;
    /** Занятое название -> `ProductNameTakenError`, занятый slug -> `SlugTakenError`. */
    abstract insertProduct(product: Product): Promise<void>;
    /** Агент и его связи с продуктами; занятое название -> `AgentNameTakenError`, slug -> `SlugTakenError`. */
    abstract insertAgent(agent: Agent): Promise<void>;
    /**
     * Идемпотентно: агент с тем же `slug` создаётся один раз, недостающие связи с продуктами
     * добавляются; существующие записи, имя и `archived_at` не меняются. Продукт или агент,
     * чьё название (без учёта регистра) занято записью с другим `slug`, пропускается вместе со связями.
     */
    abstract seed(products: readonly CatalogSeedProduct[]): Promise<CatalogSeedResult>;
}
