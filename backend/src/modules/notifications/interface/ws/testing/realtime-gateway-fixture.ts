import type { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import { RealtimeBrokerStatus } from '../../../../../shared/realtime/realtime-broker-status';
import { RealtimeBrokerStatusPort } from '../../../../../shared/realtime/realtime-broker-status.port';
import { RealtimeSettings } from '../../../../../shared/realtime/realtime-settings';
import { JwtAccessTokenService } from '../../../../auth/infrastructure/jwt-access-token.service';
import { ConnectionAuthenticatorPort } from '../../../application/ports/connection-authenticator.port';
import { RealtimeConnectionMetricsPort } from '../../../application/ports/realtime-connection-metrics.port';
import { NotificationClockPort } from '../../../domain/ports/notification-clock.port';
import { ConnectionAuthenticator } from '../../../infrastructure/connection-authenticator';
import { NotificationClock } from '../../../infrastructure/notification-clock';
import { NotificationsGateway } from '../notifications.gateway';
import { UserRealtimeEmitter } from '../user-realtime-emitter';

export const TOKEN_SECRET = 's'.repeat(40);
export const ACCESS_TTL_SECONDS = 900;
export const ALLOWED_ORIGIN = 'chrome-extension://allowed-extension';

export class RecordingConnectionMetrics extends RealtimeConnectionMetricsPort {
    openConnections = 0;

    readonly history: number[] = [];

    connectionOpened(): void {
        this.openConnections += 1;
        this.history.push(this.openConnections);
    }

    connectionClosed(): void {
        this.openConnections -= 1;
        this.history.push(this.openConnections);
    }
}

export interface ConnectOptions {
    readonly auth?: Record<string, unknown>;
    readonly origin?: string;
    readonly query?: Record<string, string>;
}

export interface TokenOptions {
    readonly mustChangePassword?: boolean;
    readonly expiresInSeconds?: number;
}

export interface ReceivedEvent {
    readonly name: string;
    readonly payload: unknown;
}

export class TestClient {
    readonly events: ReceivedEvent[] = [];

    readonly disconnected: Promise<string>;

    private readonly waiters: { name: string; resolve: (payload: unknown) => void }[] = [];

    constructor(readonly socket: ClientSocket) {
        socket.onAny((name: string, payload: unknown) => {
            this.events.push({ name, payload });
            for (const waiter of this.waiters.filter((candidate) => candidate.name === name)) {
                waiter.resolve(payload);
            }
        });
        this.disconnected = new Promise((resolve) => {
            socket.once('disconnect', (reason) => {
                resolve(reason);
            });
        });
    }

    received(name: string): unknown[] {
        return this.events.filter((event) => event.name === name).map((event) => event.payload);
    }

    nextEvent(name: string): Promise<unknown> {
        const existing = this.events.find((event) => event.name === name);
        if (existing !== undefined) return Promise.resolve(existing.payload);
        return new Promise((resolve) => {
            this.waiters.push({ name, resolve });
        });
    }
}

export interface RealtimeGatewayFixture {
    readonly app: INestApplication;
    readonly metrics: RecordingConnectionMetrics;
    readonly emitter: UserRealtimeEmitter;
    readonly brokerStatus: RealtimeBrokerStatus;
    token(userId: string, options?: TokenOptions): string;
    connect(options?: ConnectOptions): Promise<TestClient>;
    close(): Promise<void>;
}

export function signToken(userId: string, options: TokenOptions = {}): string {
    const expiresInSeconds = options.expiresInSeconds ?? ACCESS_TTL_SECONDS;
    const issuedAtMs = Date.now() - (ACCESS_TTL_SECONDS - expiresInSeconds) * 1000;
    const tokens = new JwtAccessTokenService({
        secret: TOKEN_SECRET,
        ttlSeconds: ACCESS_TTL_SECONDS,
        clock: { now: () => new Date(issuedAtMs) },
    });
    return tokens.sign({
        sub: userId,
        sid: 'session-1',
        mcp: options.mustChangePassword ?? false,
    }).token;
}

export async function startRealtimeGatewayFixture(): Promise<RealtimeGatewayFixture> {
    const metrics = new RecordingConnectionMetrics();
    const brokerStatus = new RealtimeBrokerStatus();
    const verifier = new JwtAccessTokenService({
        secret: TOKEN_SECRET,
        ttlSeconds: ACCESS_TTL_SECONDS,
        clock: { now: () => new Date() },
    });
    const moduleRef = await Test.createTestingModule({
        providers: [
            NotificationsGateway,
            UserRealtimeEmitter,
            {
                provide: ConnectionAuthenticatorPort,
                useValue: new ConnectionAuthenticator(verifier),
            },
            {
                provide: RealtimeSettings,
                useValue: new RealtimeSettings({
                    allowedOrigins: [ALLOWED_ORIGIN],
                    pingIntervalMs: 20_000,
                }),
            },
            { provide: NotificationClockPort, useClass: NotificationClock },
            { provide: RealtimeConnectionMetricsPort, useValue: metrics },
            { provide: RealtimeBrokerStatusPort, useValue: brokerStatus },
            { provide: PinoLogger, useValue: new PinoLogger({ pinoHttp: { level: 'silent' } }) },
        ],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);
    const base = (await app.getUrl()).replace('[::1]', 'localhost');
    const sockets: ClientSocket[] = [];

    return {
        app,
        metrics,
        emitter: app.get(UserRealtimeEmitter),
        brokerStatus,
        token: signToken,
        connect: (options = {}) =>
            new Promise((resolve, reject) => {
                const socket = io(`${base}/notifications`, {
                    transports: ['websocket'],
                    reconnection: false,
                    forceNew: true,
                    ...(options.auth === undefined ? {} : { auth: options.auth }),
                    ...(options.query === undefined ? {} : { query: options.query }),
                    ...(options.origin === undefined
                        ? {}
                        : { extraHeaders: { origin: options.origin } }),
                });
                sockets.push(socket);
                const client = new TestClient(socket);
                socket.once('connect', () => {
                    resolve(client);
                });
                socket.once('connect_error', reject);
            }),
        close: async () => {
            for (const socket of sockets) socket.disconnect();
            await app.close();
        },
    };
}
