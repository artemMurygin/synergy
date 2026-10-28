import { Module } from '@nestjs/common';
import { CrmGatewayPort } from '../../domain/ports/crm-gateway.port';
import { MockCrmGatewayAdapter } from './mock-crm-gateway.adapter';

@Module({
    providers: [
        MockCrmGatewayAdapter,
        { provide: CrmGatewayPort, useExisting: MockCrmGatewayAdapter },
    ],
    exports: [CrmGatewayPort],
})
export class CrmModule {}
