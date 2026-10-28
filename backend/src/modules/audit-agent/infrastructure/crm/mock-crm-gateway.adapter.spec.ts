import { describe, expect, it } from 'vitest';
import { DealId } from '../../domain/value-objects/deal-id.value-object';
import { DealNotFoundError } from '../../domain/errors/deal-not-found.error';
import { REQUIRED_FIELDS } from '../../domain/value-objects/required-field';
import { MockCrmGatewayAdapter } from './mock-crm-gateway.adapter';

const EPOCH = new Date(0);
const FAR_FUTURE = new Date('2100-01-01T00:00:00Z');

describe('MockCrmGatewayAdapter', () => {
    const gateway = new MockCrmGatewayAdapter();

    it('returns every deal id when since is the epoch', async () => {
        const dealIds = await gateway.listUpdatedDealIds(EPOCH);

        expect(dealIds.length).toBeGreaterThanOrEqual(10);
    });

    it('returns an empty list when nothing was updated after since', async () => {
        await expect(gateway.listUpdatedDealIds(FAR_FUTURE)).resolves.toEqual([]);
    });

    it('returns only deals updated strictly after since', async () => {
        const allIds = await gateway.listUpdatedDealIds(EPOCH);
        const deals = await Promise.all(allIds.map((dealId) => gateway.getDeal(dealId)));
        const sortedTimes = deals.map((deal) => deal.updatedAt.getTime()).sort((a, b) => a - b);
        const boundary = new Date(sortedTimes[Math.floor(sortedTimes.length / 2)] ?? 0);

        const filteredIds = await gateway.listUpdatedDealIds(boundary);
        const filteredDeals = await Promise.all(
            filteredIds.map((dealId) => gateway.getDeal(dealId)),
        );

        expect(filteredIds.length).toBeGreaterThan(0);
        expect(filteredIds.length).toBeLessThan(allIds.length);
        expect(filteredDeals.every((deal) => deal.updatedAt.getTime() > boundary.getTime())).toBe(
            true,
        );
    });

    it('returns a full deal card by id', async () => {
        const deal = await gateway.getDeal(new DealId('1001'));

        expect(deal.dealId.value).toBe('1001');
        expect(deal.clientName).not.toBeNull();
        expect(deal.responsibleId).not.toBe('');
        expect(deal.updatedAt).toBeInstanceOf(Date);
    });

    it('throws DealNotFoundError for an unknown id', async () => {
        await expect(gateway.getDeal(new DealId('unknown-deal'))).rejects.toBeInstanceOf(
            DealNotFoundError,
        );
    });

    it('contains fully filled and incomplete deals with different missing fields', async () => {
        const dealIds = await gateway.listUpdatedDealIds(EPOCH);
        const deals = await Promise.all(dealIds.map((dealId) => gateway.getDeal(dealId)));

        const missingFieldsByDeal = deals.map((deal) =>
            REQUIRED_FIELDS.filter((field) => deal[field] === null || deal[field] === ''),
        );
        const distinctMissingFields = new Set(missingFieldsByDeal.flat());

        expect(missingFieldsByDeal.some((fields) => fields.length === 0)).toBe(true);
        expect(distinctMissingFields.size).toBeGreaterThanOrEqual(3);
    });

    it('spreads deals across several responsible ids', async () => {
        const dealIds = await gateway.listUpdatedDealIds(EPOCH);
        const deals = await Promise.all(dealIds.map((dealId) => gateway.getDeal(dealId)));

        expect(new Set(deals.map((deal) => deal.responsibleId)).size).toBeGreaterThanOrEqual(3);
    });
});
