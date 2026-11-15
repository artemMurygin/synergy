import { ApiProperty } from '@nestjs/swagger';
import type { Page, RequestView } from '../../application/request-view';
import { FREQUENCY_PERIODS, type FrequencyPeriod } from '../../domain/frequency';
import type { RequestStatusCode } from '../../domain/request-status-policy';

const UUID_EXAMPLE = '2cdc8ab1-6d50-49cc-ba14-54e4ac7ec231';

class FrequencyResponse {
    @ApiProperty({ example: 5 })
    readonly count!: number;

    @ApiProperty({ enum: FREQUENCY_PERIODS })
    readonly period!: FrequencyPeriod;
}

class RequestStatusResponse {
    @ApiProperty({ example: 'pending' })
    readonly code!: RequestStatusCode;

    @ApiProperty({ example: 'На рассмотрении' })
    readonly label!: string;
}

class AuthorResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id!: string;

    @ApiProperty({ example: 'anna' })
    readonly login!: string;

    @ApiProperty({
        example: 'Иванова Анна Петровна',
        description: 'Фамилия, имя, отчество; если не заполнены, логин',
    })
    readonly fullName!: string;
}

class RequestSkillResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id!: string;

    @ApiProperty()
    readonly name!: string;

    @ApiProperty()
    readonly description!: string;
}

export class RequestResponse {
    @ApiProperty({ example: UUID_EXAMPLE })
    readonly id: string;

    @ApiProperty()
    readonly title: string;

    @ApiProperty()
    readonly description: string;

    @ApiProperty({ type: FrequencyResponse })
    readonly frequency: FrequencyResponse;

    @ApiProperty()
    readonly minutesPerRun: number;

    @ApiProperty()
    readonly peopleCount: number;

    @ApiProperty({ type: RequestStatusResponse, description: 'Статус для автора' })
    readonly status: RequestStatusResponse;

    @ApiProperty({ type: AuthorResponse })
    readonly author: AuthorResponse;

    @ApiProperty({ type: String, nullable: true })
    readonly rejectReason: string | null;

    @ApiProperty({ type: RequestSkillResponse, nullable: true })
    readonly skill: RequestSkillResponse | null;

    @ApiProperty({ example: '2026-11-06T10:00:00.000Z' })
    readonly createdAt: string;

    constructor(view: RequestView) {
        this.id = view.id;
        this.title = view.title;
        this.description = view.description;
        this.frequency = { count: view.frequency.count, period: view.frequency.period };
        this.minutesPerRun = view.minutesPerRun;
        this.peopleCount = view.peopleCount;
        this.status = { code: view.status.code, label: view.status.label };
        this.author = { id: view.authorId, login: view.authorLogin, fullName: view.authorFullName };
        this.rejectReason = view.rejectReason;
        this.skill = view.skill === null ? null : { ...view.skill };
        this.createdAt = view.createdAt.toISOString();
    }
}

export class RequestListResponse {
    @ApiProperty({ type: [RequestResponse] })
    readonly items: RequestResponse[];

    @ApiProperty({ description: 'Всего записей по запросу' })
    readonly total: number;

    @ApiProperty()
    readonly limit: number;

    @ApiProperty()
    readonly page: number;

    constructor(result: Page<RequestView>, paging: { limit: number; page: number }) {
        this.items = result.items.map((view) => new RequestResponse(view));
        this.total = result.total;
        this.limit = paging.limit;
        this.page = paging.page;
    }
}
