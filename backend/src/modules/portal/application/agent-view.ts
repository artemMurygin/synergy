import type { Agent } from '../domain/agent';
import type { Product } from '../domain/product';

/** Представление агента для API: продукты (по slug) и архивная отметка. */
export interface AgentView {
    id: string;
    slug: string;
    name: string;
    products: Product[];
    archivedAt: Date | null;
}

export function toAgentView(agent: Agent, products: readonly Product[]): AgentView {
    return {
        id: agent.id,
        slug: agent.slug,
        name: agent.name,
        products: [...products],
        archivedAt: agent.archivedAt,
    };
}
