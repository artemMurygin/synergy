import { Server as HttpServer } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis, type RedisOptions } from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import { Server, type ServerOptions } from 'socket.io';
import { BaseError } from '../errors';
import { isOriginAllowed } from '../http/origin-matcher';
import type { RealtimeBrokerStatus } from './realtime-broker-status';
import type { RealtimeSettings } from './realtime-settings';

const DEFAULT_CHANNEL_KEY = 'audit-agent:socket.io';

export class RealtimeRedisNotConnectedError extends BaseError {
    readonly code = 'REALTIME.REDIS_NOT_CONNECTED';
}

export interface ClusteredIoAdapterOptions {
    readonly redis: RedisOptions;
    readonly logger: PinoLogger;
    readonly brokerStatus: RealtimeBrokerStatus;
    readonly channelKey?: string;
}

type AdapterConstructor = ReturnType<typeof createAdapter>;

function isHttpServer(value: unknown): value is HttpServer {
    return value instanceof HttpServer;
}

export class ClusteredIoAdapter extends IoAdapter {
    private adapterConstructor: AdapterConstructor | undefined;

    private readonly redisClients: Redis[] = [];

    constructor(
        private readonly attachedServer: HttpServer,
        private readonly settings: RealtimeSettings,
        private readonly options: ClusteredIoAdapterOptions,
    ) {
        super(attachedServer);
        this.options.logger.setContext(ClusteredIoAdapter.name);
    }

    static forApplication(
        app: INestApplication,
        settings: RealtimeSettings,
        options: ClusteredIoAdapterOptions,
    ): ClusteredIoAdapter {
        const httpServer: unknown = app.getHttpServer();
        if (!isHttpServer(httpServer)) {
            throw new TypeError('The application must run on a node:http server');
        }
        return new ClusteredIoAdapter(httpServer, settings, options);
    }

    async connectToRedis(): Promise<void> {
        const publisher = new Redis({ ...this.options.redis, lazyConnect: true });
        const subscriber = publisher.duplicate();
        for (const client of [publisher, subscriber]) {
            client.on('error', (error: Error) => {
                this.options.logger.error({ err: error }, 'Realtime Redis client failed');
            });
            this.redisClients.push(client);
        }
        await Promise.all([publisher.connect(), subscriber.connect()]);
        this.options.brokerStatus.attachPublisher(publisher);
        this.adapterConstructor = createAdapter(publisher, subscriber, {
            key: this.options.channelKey ?? DEFAULT_CHANNEL_KEY,
        });
    }

    override createIOServer(port: number, options: Partial<ServerOptions> = {}): Server {
        if (this.adapterConstructor === undefined) {
            throw new RealtimeRedisNotConnectedError('Redis is not connected');
        }
        const allowedOrigins = this.settings.allowedOrigins;
        const serverOptions: Partial<ServerOptions> = {
            ...options,
            transports: ['websocket'],
            pingInterval: this.settings.pingIntervalMs,
            cors: {
                credentials: true,
                origin: (origin, callback) => {
                    callback(null, origin === undefined || isOriginAllowed(origin, allowedOrigins));
                },
            },
        };
        const server =
            port === 0
                ? new Server(this.attachedServer, serverOptions)
                : new Server(port, serverOptions);
        server.adapter(this.adapterConstructor);
        return server;
    }

    override async close(server: Server): Promise<void> {
        await super.close(server);
        await this.disconnectRedis();
    }

    override async dispose(): Promise<void> {
        await super.dispose();
        await this.disconnectRedis();
    }

    private async disconnectRedis(): Promise<void> {
        const clients = this.redisClients.splice(0);
        await Promise.all(
            clients.map(async (client) => {
                if (client.status === 'ready') await client.quit();
                else client.disconnect();
            }),
        );
    }
}
