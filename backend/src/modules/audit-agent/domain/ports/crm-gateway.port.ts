import type { DealId } from '../value-objects/deal-id.value-object';
import type { Deal } from '../entities/deal.entity';

export abstract class CrmGatewayPort {
    abstract listUpdatedDealIds(since: Date): Promise<DealId[]>;

    abstract getDeal(id: DealId): Promise<Deal>;
}
