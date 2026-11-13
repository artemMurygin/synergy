import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import type { Agent } from '../domain/agent';
import {
    CatalogRepository,
    type AgentWithProduct,
    type CatalogSeedProduct,
    type CatalogSeedResult,
} from '../domain/ports/catalog-repository.port';

const agentRow = z.object({
    id: z.string(),
    product_id: z.string(),
    slug: z.string(),
    name: z.string(),
});

const agentWithProductRow = agentRow.extend({
    product_slug: z.string(),
    product_name: z.string(),
});

const idRow = z.object({ id: z.string() });

@Injectable()
export class SlonikCatalogRepository extends CatalogRepository {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async listAgents(): Promise<AgentWithProduct[]> {
        const rows = await this.transactions.executor().any(sql.unsafe`
            SELECT a.id, a.product_id, a.slug, a.name,
                   p.slug AS product_slug, p.name AS product_name
            FROM portal_agents a
            JOIN portal_products p ON p.id = a.product_id
            ORDER BY p.slug, a.slug`);
        return rows.map((raw) => {
            const row = agentWithProductRow.parse(raw);
            return {
                agent: {
                    id: row.id,
                    productId: row.product_id,
                    slug: row.slug,
                    name: row.name,
                },
                product: { id: row.product_id, slug: row.product_slug, name: row.product_name },
            };
        });
    }

    async findAgent(id: string): Promise<Agent | null> {
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            SELECT id, product_id, slug, name FROM portal_agents WHERE id = ${id}`);
        if (row === null) return null;
        const parsed = agentRow.parse(row);
        return {
            id: parsed.id,
            productId: parsed.product_id,
            slug: parsed.slug,
            name: parsed.name,
        };
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
                        INSERT INTO portal_agents (product_id, slug, name)
                        VALUES (${productId}, ${agent.slug}, ${agent.name})
                        ON CONFLICT (slug) DO NOTHING
                        RETURNING id`);
                    if (created !== null) agentsCreated += 1;
                }
            }
            return { productsCreated, agentsCreated };
        });
    }
}
