import { ApiProperty } from '@nestjs/swagger';
import type { Page } from '../../application/request-view';
import type { SkillView } from '../../application/skill-view';
import type { ProductRef } from '../../domain/ports/catalog-query.port';
import type { AgentWithProducts } from '../../domain/ports/catalog-repository.port';
import { SKILL_STATUSES, type SkillStatus } from '../../domain/skill-status';

const UUID_EXAMPLE = '2cdc8ab1-6d50-49cc-ba14-54e4ac7ec231';

class RefResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id!: string;

    @ApiProperty()
    readonly name!: string;
}

export class ProductRefResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id!: string;

    @ApiProperty({ example: 'control-center' })
    readonly slug!: string;

    @ApiProperty()
    readonly name!: string;
}

export function toProductRefs(products: readonly ProductRef[]): ProductRefResponse[] {
    return products.map((product) => ({ id: product.id, slug: product.slug, name: product.name }));
}

export class AgentResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id: string;

    @ApiProperty({ example: 'Ассистент' })
    readonly name: string;

    @ApiProperty({ type: [ProductRefResponse], description: 'Продукты агента, по slug' })
    readonly products: ProductRefResponse[];

    @ApiProperty({
        type: String,
        nullable: true,
        example: null,
        description: 'Время архивации; null у активного агента',
    })
    readonly archivedAt: string | null;

    constructor(source: {
        id: string;
        name: string;
        products: readonly ProductRef[];
        archivedAt: Date | null;
    }) {
        this.id = source.id;
        this.name = source.name;
        this.products = toProductRefs(source.products);
        this.archivedAt = source.archivedAt?.toISOString() ?? null;
    }

    static fromListItem({ agent, products }: AgentWithProducts): AgentResponse {
        return new AgentResponse({
            id: agent.id,
            name: agent.name,
            products,
            archivedAt: agent.archivedAt,
        });
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

    @ApiProperty({
        enum: SKILL_STATUSES,
        isArray: true,
        description: 'Допустимые переходы из текущего статуса',
    })
    readonly nextStatuses: SkillStatus[];

    @ApiProperty({ type: RefResponse })
    readonly agent: RefResponse;

    @ApiProperty({ type: [ProductRefResponse], description: 'Продукты агента, по slug' })
    readonly products: ProductRefResponse[];

    @ApiProperty({ description: 'Число привязанных заявок' })
    readonly requestsCount: number;

    @ApiProperty({ example: '2026-11-06T10:00:00.000Z' })
    readonly createdAt: string;

    @ApiProperty({ example: '2026-11-06T11:00:00.000Z' })
    readonly statusChangedAt: string;

    @ApiProperty({ type: String, nullable: true, description: 'Первый запуск; null до запуска' })
    readonly launchedAt: string | null;

    @ApiProperty({ type: String, nullable: true, description: 'Время архивации; null у активного' })
    readonly archivedAt: string | null;

    constructor(view: SkillView) {
        this.id = view.id;
        this.name = view.name;
        this.description = view.description;
        this.status = view.status;
        this.nextStatuses = view.nextStatuses;
        this.agent = { id: view.agent.id, name: view.agent.name };
        this.products = toProductRefs(view.products);
        this.requestsCount = view.linkedRequestCount;
        this.createdAt = view.createdAt.toISOString();
        this.statusChangedAt = view.statusChangedAt.toISOString();
        this.launchedAt = view.launchedAt?.toISOString() ?? null;
        this.archivedAt = view.archivedAt?.toISOString() ?? null;
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
