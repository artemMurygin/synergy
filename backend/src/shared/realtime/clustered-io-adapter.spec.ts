import { createServer, type Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import type { Server } from 'socket.io';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RealtimeSettings } from './realtime-settings';
import { ClusteredIoAdapter } from './clustered-io-adapter';
import { RealtimeBrokerStatus } from './realtime-broker-status';

const redisOptions = {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    ...(process.env.REDIS_PASSWORD === undefined ? {} : { password: process.env.REDIS_PASSWORD }),
};
const ALLOWED_ORIGIN = 'chrome-extension://allowed-extension';
const PING_INTERVAL_MS = 1500;
const NAMESPACE = '/notifications';

const settings = new RealtimeSettings({
    allowedOrigins: [ALLOWED_ORIGIN],
    pingIntervalMs: PING_INTERVAL_MS,
});
const silentLogger = (): PinoLogger => new PinoLogger({ pinoHttp: { level: 'silent' } });

async function isRedisAvailable(): Promise<boolean> {
    const probe = new Redis({
        ...redisOptions,
        lazyConnect: true,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null,
    });
    probe.on('error', () => undefined);
    try {
        await probe.connect();
        await probe.ping();
        await probe.quit();
        return true;
    } catch {
        probe.disconnect();
        return false;
    }
}

interface Instance {
    readonly adapter: ClusteredIoAdapter;
    readonly httpServer: HttpServer;
    readonly server: Server;
    readonly url: string;
}

describe('ClusteredIoAdapter', () => {
    let isAvailable = false;
    const instances: Instance[] = [];
    const clients: ClientSocket[] = [];
    const channelKey = `test-socket.io-${randomUUID()}`;

    async function startInstance(brokerStatus = new RealtimeBrokerStatus()): Promise<Instance> {
        const httpServer = createServer();
        const adapter = new ClusteredIoAdapter(httpServer, settings, {
            redis: redisOptions,
            channelKey,
            logger: silentLogger(),
            brokerStatus,
        });
        await adapter.connectToRedis();
        const server = adapter.createIOServer(0);
        await new Promise<void>((resolve) => httpServer.listen(0, resolve));
        const address = httpServer.address();
        if (address === null || typeof address === 'string') throw new Error('Server is not bound');
        const { port } = address;
        const instance = { adapter, httpServer, server, url: `http://localhost:${String(port)}` };
        instances.push(instance);
        return instance;
    }

    beforeAll(async () => {
        isAvailable = await isRedisAvailable();
    });

    afterEach(async () => {
        for (const client of clients.splice(0)) client.disconnect();
        for (const instance of instances.splice(0)) {
            await instance.adapter.close(instance.server);
            await new Promise((resolve) => instance.httpServer.close(resolve));
        }
    });

    it('delivers a room event to a connection held by another instance', async (ctx) => {
        if (!isAvailable) return ctx.skip();
        const holder = await startInstance();
        const sender = await startInstance();
        holder.server.of(NAMESPACE).on('connection', (socket) => {
            void socket.join('user:boris');
        });
        sender.server.of(NAMESPACE);
        const client = io(`${holder.url}${NAMESPACE}`, {
            transports: ['websocket'],
            reconnection: false,
            forceNew: true,
        });
        clients.push(client);
        await new Promise<void>((resolve) => {
            client.once('connect', () => {
                resolve();
            });
        });
        const received = new Promise<unknown>((resolve) => {
            client.once('notification.created', resolve);
        });

        await expect
            .poll(
                async () =>
                    (await sender.server.of(NAMESPACE).in('user:boris').fetchSockets()).length,
            )
            .toBe(1);
        sender.server
            .of(NAMESPACE)
            .to('user:boris')
            .emit('notification.created', { unreadCount: 1 });

        expect(await received).toEqual({ unreadCount: 1 });
    });

    it('accepts only the websocket transport and applies the ping interval', async (ctx) => {
        if (!isAvailable) return ctx.skip();
        const instance = await startInstance();

        const polling = await fetch(`${instance.url}/socket.io/?EIO=4&transport=polling`);

        expect(polling.status).toBe(400);
        expect(instance.server.engine.opts.pingInterval).toBe(PING_INTERVAL_MS);
        expect(instance.server.engine.opts.transports).toEqual(['websocket']);
    });

    it('reports the broker unavailable once the publishing connection is lost', async (ctx) => {
        if (!isAvailable) return ctx.skip();
        const brokerStatus = new RealtimeBrokerStatus();
        const instance = await startInstance(brokerStatus);
        expect(brokerStatus.isAvailable()).toBe(true);

        instances.splice(instances.indexOf(instance), 1);
        await instance.adapter.close(instance.server);
        await new Promise((resolve) => instance.httpServer.close(resolve));

        await expect.poll(() => brokerStatus.isAvailable()).toBe(false);
    });

    it('refuses to create a server before Redis is connected', () => {
        const adapter = new ClusteredIoAdapter(createServer(), settings, {
            redis: redisOptions,
            channelKey,
            logger: silentLogger(),
            brokerStatus: new RealtimeBrokerStatus(),
        });

        expect(() => adapter.createIOServer(0)).toThrow('Redis is not connected');
    });
});
