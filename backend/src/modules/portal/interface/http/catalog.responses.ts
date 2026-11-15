import { ApiProperty } from '@nestjs/swagger';
import type { ArchiveView } from '../../application/get-archive.use-case';
import type {
    CatalogAgentView,
    CatalogProductView,
    CatalogSkillView,
    CatalogView,
} from '../../application/get-catalog.use-case';
import type { ArchivedAgentRow, ArchivedSkillRow } from '../../domain/ports/catalog-query.port';
import { SKILL_STATUSES, type SkillStatus } from '../../domain/skill-status';
import { ProductRefResponse, toProductRefs } from './skills.responses';

const UUID_EXAMPLE = '2cdc8ab1-6d50-49cc-ba14-54e4ac7ec231';

class AgentStatusResponse {
    @ApiProperty({ enum: ['working', 'in_development'] })
    readonly code!: string;

    @ApiProperty({ example: 'Работает' })
    readonly label!: string;
}

class CatalogSkillResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id: string;

    @ApiProperty()
    readonly name: string;

    @ApiProperty()
    readonly description: string;

    @ApiProperty({ enum: SKILL_STATUSES })
    readonly status: SkillStatus;

    @ApiProperty({ example: '2026-11-06T11:00:00.000Z' })
    readonly statusChangedAt: string;

    @ApiProperty({ enum: SKILL_STATUSES, isArray: true })
    readonly nextStatuses: SkillStatus[];

    constructor(view: CatalogSkillView) {
        this.id = view.id;
        this.name = view.name;
        this.description = view.description;
        this.status = view.status;
        this.statusChangedAt = view.statusChangedAt.toISOString();
        this.nextStatuses = view.nextStatuses;
    }
}

class CatalogAgentResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id: string;

    @ApiProperty({ example: 'assistant' })
    readonly slug: string;

    @ApiProperty({ example: 'Ассистент' })
    readonly name: string;

    @ApiProperty({ type: AgentStatusResponse })
    readonly status: AgentStatusResponse;

    @ApiProperty({ type: [ProductRefResponse] })
    readonly products: ProductRefResponse[];

    @ApiProperty({ type: [CatalogSkillResponse] })
    readonly skills: CatalogSkillResponse[];

    constructor(view: CatalogAgentView) {
        this.id = view.id;
        this.slug = view.slug;
        this.name = view.name;
        this.status = { code: view.status.code, label: view.status.label };
        this.products = toProductRefs(view.products);
        this.skills = view.skills.map((skill) => new CatalogSkillResponse(skill));
    }
}

class CatalogProductResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id: string;

    @ApiProperty({ example: 'control-center' })
    readonly slug: string;

    @ApiProperty()
    readonly name: string;

    @ApiProperty({ type: [CatalogAgentResponse] })
    readonly agents: CatalogAgentResponse[];

    constructor(view: CatalogProductView) {
        this.id = view.id;
        this.slug = view.slug;
        this.name = view.name;
        this.agents = view.agents.map((agent) => new CatalogAgentResponse(agent));
    }
}

export class CatalogResponse {
    @ApiProperty({ type: [CatalogProductResponse] })
    readonly products: CatalogProductResponse[];

    constructor(view: CatalogView) {
        this.products = view.products.map((product) => new CatalogProductResponse(product));
    }
}

class ArchivedAgentResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id: string;

    @ApiProperty()
    readonly name: string;

    @ApiProperty({ type: [ProductRefResponse] })
    readonly products: ProductRefResponse[];

    @ApiProperty({ description: 'Навыки без собственного архива: вернутся вместе с агентом' })
    readonly skillsCount: number;

    @ApiProperty({ example: '2026-11-06T12:00:00.000Z' })
    readonly archivedAt: string;

    constructor(row: ArchivedAgentRow) {
        this.id = row.id;
        this.name = row.name;
        this.products = toProductRefs(row.products);
        this.skillsCount = row.skillsCount;
        this.archivedAt = row.archivedAt.toISOString();
    }
}

class ArchivedSkillAgentResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id!: string;

    @ApiProperty()
    readonly name!: string;
}

class ArchivedSkillResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id: string;

    @ApiProperty()
    readonly name: string;

    @ApiProperty({ type: ArchivedSkillAgentResponse })
    readonly agent: ArchivedSkillAgentResponse;

    @ApiProperty({ type: [ProductRefResponse] })
    readonly products: ProductRefResponse[];

    @ApiProperty({ enum: SKILL_STATUSES })
    readonly status: SkillStatus;

    @ApiProperty({ example: '2026-11-06T13:00:00.000Z' })
    readonly archivedAt: string;

    constructor(row: ArchivedSkillRow) {
        this.id = row.id;
        this.name = row.name;
        this.agent = { id: row.agent.id, name: row.agent.name };
        this.products = toProductRefs(row.products);
        this.status = row.status;
        this.archivedAt = row.archivedAt.toISOString();
    }
}

export class ArchiveResponse {
    @ApiProperty({ type: [ArchivedAgentResponse] })
    readonly agents: ArchivedAgentResponse[];

    @ApiProperty({ type: [ArchivedSkillResponse] })
    readonly skills: ArchivedSkillResponse[];

    constructor(view: ArchiveView) {
        this.agents = view.agents.map((agent) => new ArchivedAgentResponse(agent));
        this.skills = view.skills.map((skill) => new ArchivedSkillResponse(skill));
    }
}
