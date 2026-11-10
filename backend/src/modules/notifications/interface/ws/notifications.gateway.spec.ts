import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ALLOWED_ORIGIN,
    type RealtimeGatewayFixture,
    startRealtimeGatewayFixture,
} from './testing/realtime-gateway-fixture';

const ANNA = '0b9a7c2e-1d3f-4a5b-8c6d-7e8f90a1b2c3';
const BORIS = '5d2f6c1a-9b8e-4c7d-a1f0-3e4b5c6d7e8f';

const notificationRead = (unreadCount: number) =>
    ({
        name: 'notification.read',
        payload: { all: true, unreadCount },
    }) as const;

describe('NotificationsGateway', () => {
    let fixture: RealtimeGatewayFixture;

    beforeEach(async () => {
        fixture = await startRealtimeGatewayFixture();
    });

    afterEach(async () => {
        await fixture.close();
    });

    it('joins a connection with a token in handshake.auth to the room of its user', async () => {
        const client = await fixture.connect({ auth: { token: fixture.token(ANNA) } });
        await vi.waitFor(() => {
            expect(fixture.metrics.openConnections).toBe(1);
        });

        await fixture.emitter.emitToUser(ANNA, notificationRead(0));

        expect(await client.nextEvent('notification.read')).toEqual({ all: true, unreadCount: 0 });
        expect(client.socket.connected).toBe(true);
    });

    it.each([
        ['without a token', {}],
        ['with an empty token', { token: '' }],
        ['with a forged token', { token: 'not-a-jwt' }],
        ['with a token that is not a string', { token: 42 }],
    ])('rejects a connection %s with token_invalid', async (_case, auth) => {
        const client = await fixture.connect({ auth });

        expect(await client.nextEvent('connection_error')).toEqual({ code: 'token_invalid' });
        expect(await client.disconnected).toBe('io server disconnect');
        expect(fixture.metrics.openConnections).toBe(0);
    });

    it('rejects an expired token with token_expired', async () => {
        const client = await fixture.connect({
            auth: { token: fixture.token(ANNA, { expiresInSeconds: -60 }) },
        });

        expect(await client.nextEvent('connection_error')).toEqual({ code: 'token_expired' });
        expect(await client.disconnected).toBe('io server disconnect');
    });

    it('rejects a user with a temporary password with password_change_required', async () => {
        const client = await fixture.connect({
            auth: { token: fixture.token(ANNA, { mustChangePassword: true }) },
        });

        expect(await client.nextEvent('connection_error')).toEqual({
            code: 'password_change_required',
        });
        expect(await client.disconnected).toBe('io server disconnect');
    });

    it('ignores a token passed in the query string', async () => {
        const client = await fixture.connect({ query: { token: fixture.token(ANNA) } });

        expect(await client.nextEvent('connection_error')).toEqual({ code: 'token_invalid' });
        expect(await client.disconnected).toBe('io server disconnect');
    });

    it('rejects a browser origin that is not allowed even with a valid token', async () => {
        const client = await fixture.connect({
            auth: { token: fixture.token(ANNA) },
            origin: 'https://evil.example.com',
        });

        expect(await client.nextEvent('connection_error')).toEqual({ code: 'origin_not_allowed' });
        expect(await client.disconnected).toBe('io server disconnect');
        expect(fixture.metrics.openConnections).toBe(0);
    });

    it('accepts an allowed origin', async () => {
        const client = await fixture.connect({
            auth: { token: fixture.token(ANNA) },
            origin: ALLOWED_ORIGIN,
        });
        await vi.waitFor(() => {
            expect(fixture.metrics.openConnections).toBe(1);
        });

        expect(client.received('connection_error')).toEqual([]);
    });

    it('accepts a connection without an origin', async () => {
        const client = await fixture.connect({ auth: { token: fixture.token(ANNA) } });
        await vi.waitFor(() => {
            expect(fixture.metrics.openConnections).toBe(1);
        });

        expect(client.received('connection_error')).toEqual([]);
        expect(client.socket.connected).toBe(true);
    });

    it('sends auth_expired and disconnects when the token expires, then accepts a fresh token', async () => {
        const client = await fixture.connect({
            auth: { token: fixture.token(ANNA, { expiresInSeconds: 1 }) },
        });

        await client.nextEvent('auth_expired');
        expect(await client.disconnected).toBe('io server disconnect');
        await vi.waitFor(() => {
            expect(fixture.metrics.openConnections).toBe(0);
        });

        const fresh = await fixture.connect({ auth: { token: fixture.token(ANNA) } });
        await vi.waitFor(() => {
            expect(fixture.metrics.openConnections).toBe(1);
        });
        expect(fresh.received('connection_error')).toEqual([]);
    }, 5_000);

    it('counts open connections', async () => {
        const first = await fixture.connect({ auth: { token: fixture.token(ANNA) } });
        await fixture.connect({ auth: { token: fixture.token(BORIS) } });
        await fixture.connect({ auth: {} });
        await vi.waitFor(() => {
            expect(fixture.metrics.openConnections).toBe(2);
        });

        first.socket.disconnect();

        await vi.waitFor(() => {
            expect(fixture.metrics.openConnections).toBe(1);
        });
        expect(fixture.metrics.history).toEqual([1, 2, 1]);
    });
});
