import { Injectable } from '@nestjs/common';
import type { Page } from '../domain/ports/page';
import { SkillQuery } from '../domain/ports/skill-query.port';
import type { SkillStatus } from '../domain/skill-status';
import type { SkillView } from './skill-view';

export interface ListSkillsInput {
    status?: SkillStatus;
    limit: number;
    page: number;
}

/** Список навыков для `developer`; доступ ограничивает `RolesGuard`. */
@Injectable()
export class ListSkillsUseCase {
    constructor(private readonly query: SkillQuery) {}

    execute(input: ListSkillsInput): Promise<Page<SkillView>> {
        return this.query.list(input.status === undefined ? {} : { status: input.status }, {
            limit: input.limit,
            page: input.page,
        });
    }
}
