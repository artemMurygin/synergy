import { ApiProperty } from '@nestjs/swagger';
import type { Page } from '../../application/request-view';
import type { SkillView } from '../../application/skill-view';
import type { AgentWithProduct } from '../../domain/ports/catalog-repository.port';
import { SKILL_STATUSES, type SkillStatus } from '../../domain/skill-status';

const UUID_EXAMPLE = '2cdc8ab1-6d50-49cc-ba14-54e4ac7ec231';

class RefResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id!: string;

    @ApiProperty()
    readonly name!: string;
}

export class AgentResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id: string;

    @ApiProperty({ example: 'Ассистент' })
    readonly name: string;

    @ApiProperty({ type: RefResponse })
    readonly product: RefResponse;

    constructor({ agent, product }: AgentWithProduct) {
        this.id = agent.id;
        this.name = agent.name;
        this.product = { id: product.id, name: product.name };
    }
}

export class SkillResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id: string;

    @ApiProperty()
    readonly name: string;

    @ApiProperty()
    readonly description: string;

    @ApiProperty({ enum: SKILL_STATUSES })
    readonly status: SkillStatus;

    @ApiProperty({ type: RefResponse })
    readonly agent: RefResponse;

    @ApiProperty({ type: RefResponse })
    readonly product: RefResponse;

    @ApiProperty({ description: 'Число привязанных заявок' })
    readonly requestsCount: number;

    @ApiProperty({ example: '2026-11-06T10:00:00.000Z' })
    readonly createdAt: string;

    @ApiProperty({ example: '2026-11-06T11:00:00.000Z' })
    readonly statusChangedAt: string;

    constructor(view: SkillView) {
        this.id = view.id;
        this.name = view.name;
        this.description = view.description;
        this.status = view.status;
        this.agent = { id: view.agent.id, name: view.agent.name };
        this.product = { id: view.product.id, name: view.product.name };
        this.requestsCount = view.linkedRequestCount;
        this.createdAt = view.createdAt.toISOString();
        this.statusChangedAt = view.statusChangedAt.toISOString();
    }
}

export class SkillListResponse {
    @ApiProperty({ type: [SkillResponse] })
    readonly items: SkillResponse[];

    @ApiProperty()
    readonly total: number;

    @ApiProperty()
    readonly limit: number;

    @ApiProperty()
    readonly page: number;

    constructor(result: Page<SkillView>, paging: { limit: number; page: number }) {
        this.items = result.items.map((view) => new SkillResponse(view));
        this.total = result.total;
        this.limit = paging.limit;
        this.page = paging.page;
    }
}
