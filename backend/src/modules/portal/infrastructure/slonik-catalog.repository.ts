import { Injectable } from '@nestjs/common';
import { sql, UniqueIntegrityConstraintViolationError, type CommonQueryMethods } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { Agent } from '../domain/agent';
import { AgentNameTakenError, ProductNameTakenError, SlugTakenError } from '../domain/errors';
import {
    CatalogRepository,
    type AgentWithProducts,
    type CatalogKind,
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

const slugRow = z.object({ slug: z.string() });

const PRODUCT_NAME_INDEX = 'portal_products_name_uq';
const AGENT_NAME_INDEX = 'portal_agents_name_uq';
const PRODUCT_SLUG_KEY = 'portal_products_slug_key';
const AGENT_SLUG_KEY = 'portal_agents_slug_key';

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

    async findAgentByName(key: string): Promise<Agent | null> {
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            ${AGENT_SELECT} WHERE lower(btrim(a.name)) = ${key} LIMIT 1`);
        return row === null ? null : toAgent(row);
    }

    async findProductByName(key: string): Promise<Product | null> {
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            SELECT id, slug, name FROM portal_products WHERE lower(btrim(name)) = ${key} LIMIT 1`);
        return row === null ? null : productRow.parse(row);
    }

    async nextFreeSlug(kind: CatalogKind, base: string): Promise<string> {
        const table = sql.identifier([kind === 'agent' ? 'portal_agents' : 'portal_products']);
        const rows = await this.transactions.executor().any(sql.unsafe`
            SELECT slug FROM ${table}
            WHERE slug = ${base} OR left(slug, ${base.length + 1}) = ${`${base}-`}`);
        const taken = new Set(rows.map((raw) => slugRow.parse(raw).slug));
        let slug = base;
        for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${String(n)}`;
        return slug;
    }

    async insertProduct(product: Product): Promise<void> {
        try {
            await this.transactions.executor().query(sql.unsafe`
                INSERT INTO portal_products (id, slug, name)
                VALUES (${product.id}, ${product.slug}, ${product.name})`);
        } catch (error) {
            if (error instanceof UniqueIntegrityConstraintViolationError) {
                if (error.constraint === PRODUCT_NAME_INDEX) throw new ProductNameTakenError();
                if (error.constraint === PRODUCT_SLUG_KEY) throw new SlugTakenError();
            }
            throw error;
        }
    }

    async insertAgent(agent: Agent): Promise<void> {
        const executor = this.transactions.executor();
        try {
            await executor.query(sql.unsafe`
                INSERT INTO portal_agents (id, slug, name)
                VALUES (${agent.id}, ${agent.slug}, ${agent.name})`);
        } catch (error) {
            if (error instanceof UniqueIntegrityConstraintViolationError) {
                if (error.constraint === AGENT_NAME_INDEX) throw new AgentNameTakenError();
                if (error.constraint === AGENT_SLUG_KEY) throw new SlugTakenError();
            }
            throw error;
        }
        for (const productId of agent.productIds) {
            await executor.query(sql.unsafe`
                INSERT INTO portal_agent_products (agent_id, product_id)
                VALUES (${agent.id}, ${productId})`);
        }
    }

    seed(products: readonly CatalogSeedProduct[]): Promise<CatalogSeedResult> {
        return this.transactions.run(async () => {
            const executor = this.transactions.executor();
            const result: CatalogSeedResult = { productsCreated: 0, agentsCreated: 0, skipped: [] };
            for (const product of products) {
                let productId = await this.idBySlug(executor, 'portal_products', product.slug);
                if (productId === null) {
                    const inserted = await executor.maybeOne(sql.unsafe`
                        INSERT INTO portal_products (slug, name)
                        SELECT ${product.slug}, ${product.name}
                        WHERE NOT EXISTS (
                            SELECT 1 FROM portal_products
                            WHERE lower(btrim(name)) = lower(btrim(${product.name})))
                        ON CONFLICT DO NOTHING
                        RETURNING id`);
                    if (inserted === null) {
                        result.skipped.push({
                            kind: 'product',
                            slug: product.slug,
                            name: product.name,
                        });
                        continue;
                    }
                    result.productsCreated += 1;
                    productId = idRow.parse(inserted).id;
                }
                for (const agent of product.agents) {
                    let agentId = await this.idBySlug(executor, 'portal_agents', agent.slug);
                    if (agentId === null) {
                        const created = await executor.maybeOne(sql.unsafe`
                            INSERT INTO portal_agents (slug, name)
                            SELECT ${agent.slug}, ${agent.name}
                            WHERE NOT EXISTS (
                                SELECT 1 FROM portal_agents
                                WHERE lower(btrim(name)) = lower(btrim(${agent.name})))
                            ON CONFLICT DO NOTHING
                            RETURNING id`);
                        if (created === null) {
                            result.skipped.push({
                                kind: 'agent',
                                slug: agent.slug,
                                name: agent.name,
                            });
                            continue;
                        }
                        result.agentsCreated += 1;
                        agentId = idRow.parse(created).id;
                    }
                    await executor.query(sql.unsafe`
                        INSERT INTO portal_agent_products (agent_id, product_id)
                        VALUES (${agentId}, ${productId})
                        ON CONFLICT DO NOTHING`);
                }
            }
            return result;
        });
    }

    private async idBySlug(
        executor: CommonQueryMethods,
        table: 'portal_agents' | 'portal_products',
        slug: string,
    ): Promise<string | null> {
        const row = await executor.maybeOne(
            sql.unsafe`SELECT id FROM ${sql.identifier([table])} WHERE slug = ${slug}`,
        );
        return row === null ? null : idRow.parse(row).id;
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
