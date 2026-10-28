import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { CrmGatewayPort } from '../../domain/ports/crm-gateway.port';
import { CrmModule } from './crm.module';
import { MockCrmGatewayAdapter } from './mock-crm-gateway.adapter';

describe('CrmModule', () => {
    it('provides MockCrmGatewayAdapter as CrmGatewayPort', async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [CrmModule],
        }).compile();

        expect(moduleRef.get(CrmGatewayPort)).toBeInstanceOf(MockCrmGatewayAdapter);
    });
});
