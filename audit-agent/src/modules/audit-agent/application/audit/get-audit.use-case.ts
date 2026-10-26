import { Injectable } from '@nestjs/common';
import type { AuditRun } from '../../domain/audit/audit-run';
import { AuditRunNotFoundError } from '../../domain/audit/audit-run-not-found.error';
import { AuditRunRepository } from '../../domain/audit/audit-run.repository';

@Injectable()
export class GetAuditUseCase {
    constructor(private readonly runs: AuditRunRepository) {}

    async execute(id: string): Promise<AuditRun> {
        const run = await this.runs.findById(id);
        if (!run) throw new AuditRunNotFoundError(id);
        return run;
    }
}
