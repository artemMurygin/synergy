export const AUDIT_STATUS = {
    PENDING: 'pending',
    RUNNING: 'running',
    DONE: 'done',
    FAILED: 'failed',
} as const;

export type AuditStatus = (typeof AUDIT_STATUS)[keyof typeof AUDIT_STATUS];

export interface AuditRun {
    id: string;
    status: AuditStatus;
    input: unknown;
    result: unknown;
    created_at: number;
    updated_at: number;
}
