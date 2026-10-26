import type { AuditRun, AuditStatus } from './audit-run';

export abstract class AuditRunRepository {
    abstract create(input: unknown): Promise<AuditRun>;
    abstract findById(id: string): Promise<AuditRun | null>;
    abstract setStatus(id: string, status: AuditStatus, result?: unknown): Promise<AuditRun>;
}
