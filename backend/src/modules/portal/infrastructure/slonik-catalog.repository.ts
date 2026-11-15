import { Injectable } from '@nestjs/common';
import { sql, type CommonQueryMethods } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { Agent } from '../domain/agent';
import {
    CatalogRepository,
    type AgentWithProducts,
    type CatalogSeedProduct,
    type CatalogSeedResult,
} from '../domain/ports/catalog-repository.port';
import type { Product } from '../domain/product';
import { millis, nullableTimestamp, toDate } from './sql-helpers';

const agentRow = z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    archived_at: z.number().nullable(),
    product_ids: z.array(z.string()),
});

const productRow = z.object({ id: z.string(), slug: z.string(), name: z.string() });

const idRow = z.object({ id: z.string() });

const AGENT_SELECT = sql.fragment`
    SELECT a.id, a.slug, a.name, ${millis('a.archived_at', 'archived_at')},
           COALESCE(
               (SELECT array_agg(ap.product_id ORDER BY ap.product_id)
                FROM portal_agent_products ap WHERE ap.agent_id = a.id),
               ARRAY[]::uuid[]
           )::text[] AS product_ids
    FROM portal_agents a`;

function toAgent(raw: unknown): Agent {
    const row = agentRow.parse(raw);
    return Agent.restore({
        id: row.id,
        slug: row.slug,
        name: row.name,
        productIds: row.product_ids,
        archivedAt: toDate(row.archived_at),
        createdAt: new Date(0),
        updatedAt: new Date(0),
    });
}

@Injectable()
export class SlonikCatalogRepository extends CatalogRepository {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async listAgents(): Promise<AgentWithProducts[]> {
        const executor = this.transactions.executor();
        const agentRows = await executor.any(sql.unsafe`
            ${AGENT_SELECT} WHERE a.archived_at IS NULL ORDER BY a.slug`);
        const products = await this.productsOf(
            executor,
            agentRows.map((r) => toAgent(r)),
        );
        return agentRows.map((raw) => {
            const agent = toAgent(raw);
            return {
                agent,
                products: agent.productIds
                    .map((id) => products.get(id))
                    .filter((p): p is Product => p !== undefined)
                    .sort((a, b) => a.slug.localeCompare(b.slug)),
            };
        });
    }

    async findAgent(id: string): Promise<Agent | null> {
        return this.loadAgent(sql.fragment``, id);
    }

    findAgentForShare(id: string): Promise<Agent | null> {
        return this.loadAgent(sql.fragment`FOR SHARE OF a`, id);
    }

    findAgentForUpdate(id: string): Promise<Agent | null> {
        return this.loadAgent(sql.fragment`FOR UPDATE OF a`, id);
    }

    async findProductsByIds(ids: readonly string[]): Promise<Product[]> {
        if (ids.length === 0) return [];
        const rows = await this.transactions.executor().any(sql.unsafe`
            SELECT id, slug, name FROM portal_products
            WHERE id = ANY(${sql.array([...ids], 'uuid')}) ORDER BY slug`);
        return rows.map((raw) => productRow.parse(raw));
    }

    async saveAgent(agent: Agent): Promise<void> {
        await this.transactions.executor().query(sql.unsafe`
            UPDATE portal_agents SET archived_at = ${nullableTimestamp(agent.archivedAt)}
            WHERE id = ${agent.id}`);
    }

    seed(products: readonly CatalogSeedProduct[]): Promise<CatalogSeedResult> {
        return this.transactions.run(async () => {
            const executor = this.transactions.executor();
            let productsCreated = 0;
            let agentsCreated = 0;
            for (const product of products) {
                const inserted = await executor.maybeOne(sql.unsafe`
                    INSERT INTO portal_products (slug, name)
                    VALUES (${product.slug}, ${product.name})
                    ON CONFLICT (slug) DO NOTHING
                    RETURNING id`);
                if (inserted !== null) productsCreated += 1;
                const productId = idRow.parse(
                    inserted ??
                        (await executor.one(
                            sql.unsafe`SELECT id FROM portal_products WHERE slug = ${product.slug}`,
                        )),
                ).id;
                for (const agent of product.agents) {
                    const created = await executor.maybeOne(sql.unsafe`
                        INSERT INTO portal_agents (slug, name)
                        VALUES (${agent.slug}, ${agent.name})
                        ON CONFLICT (slug) DO NOTHING
                        RETURNING id`);
                    if (created !== null) agentsCreated += 1;
                    const agentId = idRow.parse(
                        created ??
                            (await executor.one(
                                sql.unsafe`SELECT id FROM portal_agents WHERE slug = ${agent.slug}`,
                            )),
                    ).id;
                    await executor.query(sql.unsafe`
                        INSERT INTO portal_agent_products (agent_id, product_id)
                        VALUES (${agentId}, ${productId})
                        ON CONFLICT DO NOTHING`);
                }
            }
            return { productsCreated, agentsCreated };
        });
    }

    private async loadAgent(
        lock: ReturnType<typeof sql.fragment>,
        id: string,
    ): Promise<Agent | null> {
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            ${AGENT_SELECT} WHERE a.id = ${id} ${lock}`);
        return row === null ? null : toAgent(row);
    }

    private async productsOf(
        executor: CommonQueryMethods,
        agents: readonly Agent[],
    ): Promise<Map<string, Product>> {
        const ids = [...new Set(agents.flatMap((agent) => agent.productIds))];
        if (ids.length === 0) return new Map();
        const rows = await executor.any(sql.unsafe`
            SELECT id, slug, name FROM portal_products WHERE id = ANY(${sql.array(ids, 'uuid')})`);
        return new Map(rows.map((raw) => [productRow.parse(raw).id, productRow.parse(raw)]));
    }
}
