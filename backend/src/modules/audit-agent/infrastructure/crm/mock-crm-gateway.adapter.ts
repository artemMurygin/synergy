import { Injectable } from '@nestjs/common';
import { CrmGatewayPort } from '../../domain/ports/crm-gateway.port';
import type { DealId } from '../../domain/value-objects/deal-id.value-object';
import { DealNotFoundError } from '../../domain/errors/deal-not-found.error';
import type { Deal } from '../../domain/entities/deal.entity';
import { buildMockDeals } from './mock-deals';

@Injectable()
export class MockCrmGatewayAdapter extends CrmGatewayPort {
    private readonly dealById = new Map<string, Deal>(
        buildMockDeals().map((deal) => [deal.id, deal]),
    );

    async listUpdatedDealIds(since: Date): Promise<DealId[]> {
        const updatedDeals = [...this.dealById.values()].filter(
            (deal) => deal.updatedAt.getTime() > since.getTime(),
        );
        return Promise.resolve(updatedDeals.map((deal) => deal.dealId));
    }

    async getDeal(id: DealId): Promise<Deal> {
        const deal = this.dealById.get(id.value);
        if (deal === undefined) {
            throw new DealNotFoundError(id);
        }
        return Promise.resolve(deal);
    }
}
