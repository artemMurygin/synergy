import { ApiProperty } from '@nestjs/swagger';
import type { BugListRecord, BugPerson } from '../../domain/ports/bug-query.port';
import type { BugView } from '../../application/bug-view';
import { BUG_STATUSES, type BugStatus } from '../../domain/bug-status';
import type { Page } from '../../domain/ports/page';

const UUID_EXAMPLE = '2cdc8ab1-6d50-49cc-ba14-54e4ac7ec231';

class BugPersonResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id!: string;

    @ApiProperty({ example: 'anna' })
    readonly login!: string;

    @ApiProperty({ example: 'Иванова Анна', description: 'ФИО; если не заполнено, логин' })
    readonly fullName!: string;
}

class BugNamedResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id!: string;

    @ApiProperty()
    readonly name!: string;
}

const person = (p: BugPerson): BugPerson => ({ id: p.id, login: p.login, fullName: p.fullName });

export class BugListItem {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id: string;

    @ApiProperty()
    readonly title: string;

    @ApiProperty({ type: BugNamedResponse })
    readonly product: { id: string; name: string };

    @ApiProperty({ type: BugNamedResponse })
    readonly agent: { id: string; name: string };

    @ApiProperty({ enum: BUG_STATUSES })
    readonly status: BugStatus;

    @ApiProperty({ example: '2026-11-06T10:00:00.000Z' })
    readonly createdAt: string;

    @ApiProperty({ example: '2026-11-06T10:00:00.000Z' })
    readonly statusChangedAt: string;

    @ApiProperty({ type: BugPersonResponse })
    readonly author: BugPerson;

    constructor(record: BugListRecord) {
        this.id = record.id;
        this.title = record.title;
        this.product = { id: record.product.id, name: record.product.name };
        this.agent = { id: record.agent.id, name: record.agent.name };
        this.status = record.status;
        this.createdAt = record.createdAt.toISOString();
        this.statusChangedAt = record.statusChangedAt.toISOString();
        this.author = person(record.author);
    }
}

export class BugResponse extends BugListItem {
    @ApiProperty()
    readonly description: string;

    @ApiProperty({ type: BugPersonResponse, nullable: true })
    readonly statusChangedBy: BugPerson | null;

    @ApiProperty({ type: String, nullable: true })
    readonly wontFixReason: string | null;

    @ApiProperty({ enum: BUG_STATUSES, isArray: true, description: 'Пусто, если не developer' })
    readonly nextStatuses: BugStatus[];

    constructor(view: BugView) {
        super(view);
        this.description = view.description;
        this.statusChangedBy = view.statusChangedBy === null ? null : person(view.statusChangedBy);
        this.wontFixReason = view.wontFixReason;
        this.nextStatuses = [...view.nextStatuses];
    }
}

export class BugListResponse {
    @ApiProperty({ type: [BugListItem] })
    readonly items: BugListItem[];

    @ApiProperty({ description: 'Всего записей по запросу' })
    readonly total: number;

    @ApiProperty()
    readonly limit: number;

    @ApiProperty()
    readonly page: number;

    constructor(result: Page<BugListRecord>, paging: { limit: number; page: number }) {
        this.items = result.items.map((record) => new BugListItem(record));
        this.total = result.total;
        this.limit = paging.limit;
        this.page = paging.page;
    }
}
