import type { Agent } from '../agent';
import type { Product } from '../product';

export interface AgentWithProduct {
    agent: Agent;
    product: Product;
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
    /** Все агенты вместе с продуктами. */
    abstract listAgents(): Promise<AgentWithProduct[]>;
    abstract findAgent(id: string): Promise<Agent | null>;
    /** Идемпотентно: `ON CONFLICT (slug) DO NOTHING`, существующие записи не меняются. */
    abstract seed(products: readonly CatalogSeedProduct[]): Promise<CatalogSeedResult>;
}
