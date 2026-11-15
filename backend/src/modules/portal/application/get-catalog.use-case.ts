import { Injectable } from '@nestjs/common';
import { AgentStatusPolicy, type AgentStatus } from '../domain/agent-status-policy';
import {
    CatalogQuery,
    type CatalogRow,
    type DepartmentRef,
    type ProductRef,
} from '../domain/ports/catalog-query.port';
import { SkillStatus } from '../domain/skill-status';

export interface CatalogSkillView {
    id: string;
    name: string;
    description: string;
    status: SkillStatus;
    statusChangedAt: Date;
    nextStatuses: SkillStatus[];
}

/** Продукт агента в каталоге: с отделами, которым он доступен. */
export interface CatalogProductRef extends ProductRef {
    departments: DepartmentRef[];
}

export interface CatalogAgentView {
    id: string;
    slug: string;
    name: string;
    status: AgentStatus;
    products: CatalogProductRef[];
    skills: CatalogSkillView[];
}

export interface CatalogProductView extends CatalogProductRef {
    agents: CatalogAgentView[];
}

export interface CatalogView {
    products: CatalogProductView[];
}

interface AgentAccumulator {
    id: string;
    slug: string;
    name: string;
    products: Map<string, ProductRef>;
    skills: Map<string, CatalogRow['skill'] & object>;
}

const bySlug = (a: { slug: string }, b: { slug: string }): number =>
    a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;

/** Дерево продукт → агенты → навыки. Статус агента и `nextStatuses` считаются здесь, не в SQL. */
@Injectable()
export class GetCatalogUseCase {
    constructor(private readonly query: CatalogQuery) {}

    async execute(): Promise<CatalogView> {
        const [rows, departmentRows] = await Promise.all([
            this.query.loadVisible(),
            this.query.loadProductDepartments(),
        ]);
        const departmentsOf = new Map<string, DepartmentRef[]>();
        for (const { productId, ...department } of departmentRows) {
            const list = departmentsOf.get(productId) ?? [];
            list.push(department);
            departmentsOf.set(productId, list);
        }
        const refOf = (product: ProductRef): CatalogProductRef => ({
            ...product,
            departments: [...(departmentsOf.get(product.id) ?? [])],
        });
        const products = new Map<string, ProductRef>();
        const productAgents = new Map<string, Set<string>>();
        const agents = new Map<string, AgentAccumulator>();

        for (const row of rows) {
            products.set(row.product.id, row.product);
            const inProduct = productAgents.get(row.product.id) ?? new Set<string>();
            productAgents.set(row.product.id, inProduct);
            if (row.agent === null) continue;

            inProduct.add(row.agent.id);
            let agent = agents.get(row.agent.id);
            if (agent === undefined) {
                agent = { ...row.agent, products: new Map(), skills: new Map() };
                agents.set(agent.id, agent);
            }
            agent.products.set(row.product.id, row.product);
            if (row.skill !== null) agent.skills.set(row.skill.id, row.skill);
        }

        // Агент собирается один раз: статус и навыки одинаковы во всех его ветках.
        const views = new Map<string, CatalogAgentView>();
        for (const agent of agents.values()) {
            const skills = [...agent.skills.values()].sort((a, b) =>
                a.name.localeCompare(b.name, 'ru'),
            );
            views.set(agent.id, {
                id: agent.id,
                slug: agent.slug,
                name: agent.name,
                status: AgentStatusPolicy.statusOf(skills),
                products: [...agent.products.values()].sort(bySlug).map(refOf),
                skills: skills.map((skill) => ({
                    id: skill.id,
                    name: skill.name,
                    description: skill.description,
                    status: skill.status,
                    statusChangedAt: skill.statusChangedAt,
                    nextStatuses: [...SkillStatus.allowedNext(skill.status)],
                })),
            });
        }

        return {
            products: [...products.values()].sort(bySlug).map((product) => ({
                ...refOf(product),
                agents: [...(productAgents.get(product.id) ?? [])]
                    .flatMap((id) => views.get(id) ?? [])
                    .sort(bySlug),
            })),
        };
    }
}
