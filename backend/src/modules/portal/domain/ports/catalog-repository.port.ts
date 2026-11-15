import type { Agent } from '../agent';
import type { Product } from '../product';

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

export interface CatalogSeedResult {
    productsCreated: number;
    agentsCreated: number;
}

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
    /**
     * Идемпотентно: агент с тем же `slug` создаётся один раз, недостающие связи с продуктами
     * добавляются; существующие записи, имя и `archived_at` не меняются.
     */
    abstract seed(products: readonly CatalogSeedProduct[]): Promise<CatalogSeedResult>;
}
