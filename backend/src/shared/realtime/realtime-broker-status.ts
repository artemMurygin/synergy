import { Injectable } from '@nestjs/common';
import { RealtimeBrokerStatusPort } from './realtime-broker-status.port';

const READY_STATUS = 'ready';

export interface BrokerConnection {
    readonly status: string;
}

@Injectable()
export class RealtimeBrokerStatus extends RealtimeBrokerStatusPort {
    private publisher: BrokerConnection | undefined;

    attachPublisher(publisher: BrokerConnection): void {
        this.publisher = publisher;
    }

    isAvailable(): boolean {
        return this.publisher === undefined || this.publisher.status === READY_STATUS;
    }
}
