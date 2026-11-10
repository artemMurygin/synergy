import { type OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { PinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import { BaseError } from '../../../../shared/errors';
import { isOriginAllowed } from '../../../../shared/http/origin-matcher';
import { RealtimeBrokerStatusPort } from '../../../../shared/realtime/realtime-broker-status.port';
import { RealtimeSettings } from '../../../../shared/realtime/realtime-settings';
import {
    type AuthenticatedConnection,
    ConnectionAuthenticatorPort,
    ConnectionRejectedError,
} from '../../application/ports/connection-authenticator.port';
import { RealtimeConnectionMetricsPort } from '../../application/ports/realtime-connection-metrics.port';
import {
    NOTIFICATION_CREATED_REALTIME_EVENT,
    NOTIFICATION_READ_REALTIME_EVENT,
    type RealtimeEvent,
} from '../../application/ports/user-realtime-emitter.port';
import { NotificationClockPort } from '../../domain/ports/notification-clock.port';
import {
    AUTH_EXPIRED_EVENT,
    CONNECTION_ERROR_EVENT,
    NOTIFICATIONS_NAMESPACE,
    type NotificationsNamespace,
    type NotificationsSocket,
    userRoom,
} from './realtime-protocol';

const handshakeAuthSchema = z.object({ token: z.string() });

const MAX_TIMER_DELAY_MS = 2_147_483_647;

export class RealtimeServerNotReadyError extends BaseError {
    readonly code = 'NOTIFICATIONS.REALTIME_SERVER_NOT_READY';
}

export class RealtimeBrokerUnavailableError extends BaseError {
    readonly code = 'NOTIFICATIONS.REALTIME_BROKER_UNAVAILABLE';
}

interface OpenConnection {
    readonly userId: string;
    readonly expiryTimer: NodeJS.Timeout;
}

@WebSocketGateway({ namespace: NOTIFICATIONS_NAMESPACE, transports: ['websocket'] })
export class NotificationsGateway implements OnGatewayConnection<NotificationsSocket> {
    @WebSocketServer()
    private readonly namespace: NotificationsNamespace | undefined;

    private readonly openConnections = new Map<string, OpenConnection>();

    constructor(
        private readonly authenticator: ConnectionAuthenticatorPort,
        private readonly settings: RealtimeSettings,
        private readonly clock: NotificationClockPort,
        private readonly metrics: RealtimeConnectionMetricsPort,
        private readonly brokerStatus: RealtimeBrokerStatusPort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(NotificationsGateway.name);
    }

    async handleConnection(client: NotificationsSocket): Promise<void> {
        let connection: AuthenticatedConnection;
        try {
            connection = this.authenticate(client);
        } catch (error: unknown) {
            if (error instanceof ConnectionRejectedError) {
                this.reject(client, error);
                return;
            }
            this.logger.error({ err: error }, 'Realtime connection failed unexpectedly');
            this.reject(client, new ConnectionRejectedError('token_invalid'));
            return;
        }
        await client.join(userRoom(connection.userId));
        this.open(client, connection);
    }

    emitToUser(userId: string, event: RealtimeEvent): void {
        if (this.namespace === undefined) {
            throw new RealtimeServerNotReadyError('Realtime server is not initialized');
        }
        if (!this.brokerStatus.isAvailable()) {
            throw new RealtimeBrokerUnavailableError(
                'Realtime broker is unavailable, the event would not reach other instances',
            );
        }
        const room = this.namespace.to(userRoom(userId));
        if (event.name === NOTIFICATION_CREATED_REALTIME_EVENT) {
            room.emit(NOTIFICATION_CREATED_REALTIME_EVENT, event.payload);
            return;
        }
        room.emit(NOTIFICATION_READ_REALTIME_EVENT, event.payload);
    }

    private authenticate(client: NotificationsSocket): AuthenticatedConnection {
        const origin = client.handshake.headers.origin;
        if (origin !== undefined && !isOriginAllowed(origin, this.settings.allowedOrigins)) {
            throw new ConnectionRejectedError('origin_not_allowed');
        }
        const auth = handshakeAuthSchema.safeParse(client.handshake.auth);
        return this.authenticator.authenticate(auth.success ? auth.data.token : '');
    }

    private reject(client: NotificationsSocket, error: ConnectionRejectedError): void {
        this.logger.info({ reason: error.reason }, 'Realtime connection rejected');
        client.emit(CONNECTION_ERROR_EVENT, { code: error.reason });
        client.disconnect(true);
    }

    private open(client: NotificationsSocket, connection: AuthenticatedConnection): void {
        if (client.disconnected) return;
        const lifetimeMs = connection.expiresAt.getTime() - this.clock.now().getTime();
        const expiryTimer = setTimeout(
            () => {
                this.expire(client);
            },
            Math.min(Math.max(lifetimeMs, 0), MAX_TIMER_DELAY_MS),
        );
        this.openConnections.set(client.id, { userId: connection.userId, expiryTimer });
        client.once('disconnect', (reason) => {
            this.close(client, reason);
        });
        this.metrics.connectionOpened();
        this.logger.info({ userId: connection.userId }, 'Realtime connection opened');
    }

    private expire(client: NotificationsSocket): void {
        client.emit(AUTH_EXPIRED_EVENT);
        client.disconnect(true);
    }

    private close(client: NotificationsSocket, reason: string): void {
        const connection = this.openConnections.get(client.id);
        if (connection === undefined) return;
        clearTimeout(connection.expiryTimer);
        this.openConnections.delete(client.id);
        this.metrics.connectionClosed();
        this.logger.info({ userId: connection.userId, reason }, 'Realtime connection closed');
    }
}
