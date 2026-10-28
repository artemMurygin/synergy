import { NotFoundError } from '../../../../shared/errors';
import type { DealId } from '../value-objects/deal-id.value-object';

export class DealNotFoundError extends NotFoundError {
    constructor(dealId: DealId) {
        super(`Deal ${dealId.value} not found`);
    }
}
