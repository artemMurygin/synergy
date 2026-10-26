import { NotFoundError } from '../../../../shared/errors';

export class AuditRunNotFoundError extends NotFoundError {
    constructor(readonly runId: string) {
        super(`Audit run ${runId} not found`);
    }
}
