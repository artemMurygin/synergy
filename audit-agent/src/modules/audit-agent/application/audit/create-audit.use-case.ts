import { Injectable } from '@nestjs/common';
import type { AuditStatus } from '../../domain/audit/audit-run';
import { AuditRunRepository } from '../../domain/audit/audit-run.repository';
import { AuditQueue } from './audit-queue';

export interface CreateAuditCommand {
    query: string;
}

export interface CreateAuditResult {
    id: string;
    status: AuditStatus;
}

@Injectable()
export class CreateAuditUseCase {
    constructor(
        private readonly runs: AuditRunRepository,
        private readonly queue: AuditQueue,
    ) {}

    async execute(command: CreateAuditCommand): Promise<CreateAuditResult> {
        const run = await this.runs.create(command);
        await this.queue.enqueue(run.id);
        return { id: run.id, status: run.status };
    }
}
