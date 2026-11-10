import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RealtimeEvent } from '../../application/ports/user-realtime-emitter.port';
import {
    type RealtimeGatewayFixture,
    startRealtimeGatewayFixture,
} from './testing/realtime-gateway-fixture';

const ANNA = '0b9a7c2e-1d3f-4a5b-8c6d-7e8f90a1b2c3';
const BORIS = '5d2f6c1a-9b8e-4c7d-a1f0-3e4b5c6d7e8f';
const SETTLE_MS = 200;

const created: RealtimeEvent = {
    name: 'notification.created',
    payload: {
        notification: {
            id: '9c1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
            type: 'task.assigned',
            title: 'Вам назначена задача',
            body: 'anna назначил вас ответственным: Подготовить КП',
            target: { type: 'task', id: '7a1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f' },
            actorId: ANNA,
            createdAt: '2026-11-06T10:00:00.000Z',
            readAt: null,
        },
        unreadCount: 1,
    },
};

describe('UserRealtimeEmitter', () => {
    let fixture: RealtimeGatewayFixture;

    beforeEach(async () => {
        fixture = await startRealtimeGatewayFixture();
    });

    afterEach(async () => {
        await fixture.close();
    });

    it('sends the event to every connection of the user and to nobody else', async () => {
        const borisDesktop = await fixture.connect({ auth: { token: fixture.token(BORIS) } });
        const borisExtension = await fixture.connect({ auth: { token: fixture.token(BORIS) } });
        const anna = await fixture.connect({ auth: { token: fixture.token(ANNA) } });
        await vi.waitFor(() => {
            expect(fixture.metrics.openConnections).toBe(3);
        });

        await fixture.emitter.emitToUser(BORIS, created);

        expect(await borisDesktop.nextEvent('notification.created')).toEqual(created.payload);
        expect(await borisExtension.nextEvent('notification.created')).toEqual(created.payload);
        await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
        expect(anna.events).toEqual([]);
    });

    it('sends notification.read with the ids and the unread count', async () => {
        const boris = await fixture.connect({ auth: { token: fixture.token(BORIS) } });
        await vi.waitFor(() => {
            expect(fixture.metrics.openConnections).toBe(1);
        });

        await fixture.emitter.emitToUser(BORIS, {
            name: 'notification.read',
            payload: { notificationIds: ['n-1'], unreadCount: 4 },
        });

        expect(await boris.nextEvent('notification.read')).toEqual({
            notificationIds: ['n-1'],
            unreadCount: 4,
        });
    });
});
