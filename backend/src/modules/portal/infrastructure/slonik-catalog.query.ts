import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import {
    CatalogQuery,
    type ArchiveRows,
    type CatalogRow,
} from '../domain/ports/catalog-query.port';
import { SkillStatus } from '../domain/skill-status';
import { millis, toDate } from './sql-helpers';

const catalogRow = z.object({
    product_id: z.string(),
    product_slug: z.string(),
    product_name: z.string(),
    agent_id: z.string().nullable(),
    agent_slug: z.string().nullable(),
    agent_name: z.string().nullable(),
    skill_id: z.string().nullable(),
    skill_name: z.string().nullable(),
    skill_description: z.string().nullable(),
    skill_status: z.string().nullable(),
    skill_status_changed_at: z.number().nullable(),
    skill_launched_at: z.number().nullable(),
});

const productRefs = z.array(z.object({ id: z.string(), slug: z.string(), name: z.string() }));

const archivedAgentRow = z.object({
    id: z.string(),
    name: z.string(),
    skills_count: z.number(),
    archived_at: z.number(),
    products: productRefs,
});

const archivedSkillRow = z.object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    agent_id: z.string(),
    agent_name: z.string(),
    archived_at: z.number(),
    products: productRefs,
});

/** Продукты агента как JSON-массив, отсортированный по slug. */
const PRODUCTS_OF_AGENT = sql.fragment`
    COALESCE((SELECT json_agg(json_build_object('id', p.id, 'slug', p.slug, 'name', p.name)
                              ORDER BY p.slug)
                FROM portal_agent_products ap
                JOIN portal_products p ON p.id = ap.product_id
               WHERE ap.agent_id = a.id), '[]'::json) AS products`;

@Injectable()
export class SlonikCatalogQuery extends CatalogQuery {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async loadVisible(): Promise<CatalogRow[]> {
        const rows = await this.transactions.executor().any(sql.unsafe`
            SELECT p.id AS product_id, p.slug AS product_slug, p.name AS product_name,
                   a.id AS agent_id, a.slug AS agent_slug, a.name AS agent_name,
                   s.id AS skill_id, s.name AS skill_name, s.description AS skill_description,
                   s.status AS skill_status,
                   ${millis('s.status_changed_at', 'skill_status_changed_at')},
                   ${millis('s.launched_at', 'skill_launched_at')}
              FROM portal_products p
              LEFT JOIN (portal_agent_products ap
                         JOIN portal_agents a ON a.id = ap.agent_id AND a.archived_at IS NULL)
                     ON ap.product_id = p.id
              LEFT JOIN portal_skills s ON s.agent_id = a.id AND s.archived_at IS NULL
             ORDER BY p.slug, a.slug, s.name, s.id`);
        return rows.map((raw) => {
            const row = catalogRow.parse(raw);
            const agent =
                row.agent_id === null
                    ? null
                    : { id: row.agent_id, slug: row.agent_slug ?? '', name: row.agent_name ?? '' };
            const skill =
                row.skill_id === null || row.skill_status === null
                    ? null
                    : {
                          id: row.skill_id,
                          name: row.skill_name ?? '',
                          description: row.skill_description ?? '',
                          status: SkillStatus.parse(row.skill_status),
                          statusChangedAt: new Date(row.skill_status_changed_at ?? 0),
                          launchedAt: toDate(row.skill_launched_at),
                      };
            return {
                product: { id: row.product_id, slug: row.product_slug, name: row.product_name },
                agent,
                skill,
            };
        });
    }

    async loadArchive(): Promise<ArchiveRows> {
        const executor = this.transactions.executor();
        const agents = await executor.any(sql.unsafe`
            SELECT a.id, a.name,
                   (SELECT count(*)::int FROM portal_skills s
                     WHERE s.agent_id = a.id AND s.archived_at IS NULL) AS skills_count,
                   ${millis('a.archived_at', 'archived_at')},
                   ${PRODUCTS_OF_AGENT}
              FROM portal_agents a
             WHERE a.archived_at IS NOT NULL
             ORDER BY a.archived_at DESC, a.id`);
        const skills = await executor.any(sql.unsafe`
            SELECT s.id, s.name, s.status, a.id AS agent_id, a.name AS agent_name,
                   ${millis('s.archived_at', 'archived_at')},
                   ${PRODUCTS_OF_AGENT}
              FROM portal_skills s
              JOIN portal_agents a ON a.id = s.agent_id
             WHERE s.archived_at IS NOT NULL
             ORDER BY s.archived_at DESC, s.id`);
        return {
            agents: agents.map((raw) => {
                const row = archivedAgentRow.parse(raw);
                return {
                    id: row.id,
                    name: row.name,
                    products: row.products,
                    skillsCount: row.skills_count,
                    archivedAt: new Date(row.archived_at),
                };
            }),
            skills: skills.map((raw) => {
                const row = archivedSkillRow.parse(raw);
                return {
                    id: row.id,
                    name: row.name,
                    agent: { id: row.agent_id, name: row.agent_name },
                    products: row.products,
                    status: SkillStatus.parse(row.status),
                    archivedAt: new Date(row.archived_at),
                };
            }),
        };
    }
}
