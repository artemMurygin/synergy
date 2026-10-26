import type { RequestIds } from '../../../../shared/context/request-id';

export interface AuditJobData {
    runId: string;
    requestIds?: RequestIds;
}
