import { Injectable } from '@nestjs/common';
import {
    CatalogQuery,
    type ArchivedAgentRow,
    type ArchivedSkillRow,
} from '../domain/ports/catalog-query.port';

export interface ArchiveView {
    agents: ArchivedAgentRow[];
    skills: ArchivedSkillRow[];
}

/** Архив для `developer`; доступ ограничивает `RolesGuard`. */
@Injectable()
export class GetArchiveUseCase {
    constructor(private readonly query: CatalogQuery) {}

    async execute(): Promise<ArchiveView> {
        const { agents, skills } = await this.query.loadArchive();
        return { agents, skills };
    }
}
