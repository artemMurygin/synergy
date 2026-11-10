import { describe, expect, it } from 'vitest';
import { RealtimeBrokerStatusPort } from './realtime-broker-status.port';
import { RealtimeBrokerStatus } from './realtime-broker-status';

describe('RealtimeBrokerStatus', () => {
    it('implements the port', () => {
        expect(new RealtimeBrokerStatus()).toBeInstanceOf(RealtimeBrokerStatusPort);
    });

    it('is available while no cluster publisher is attached', () => {
        expect(new RealtimeBrokerStatus().isAvailable()).toBe(true);
    });

    it('follows the readiness of the attached publisher', () => {
        const publisher = { status: 'ready' };
        const status = new RealtimeBrokerStatus();
        status.attachPublisher(publisher);
        expect(status.isAvailable()).toBe(true);

        for (const lost of ['reconnecting', 'connecting', 'close', 'end']) {
            publisher.status = lost;
            expect(status.isAvailable()).toBe(false);
        }
    });
});
