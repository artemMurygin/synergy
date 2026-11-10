import { type OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { PinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import { BaseError } from '../../../../shared/errors';
import { isOriginAllowed } from '../../../../shared/http/origin-matcher';
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
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(NotificationsGateway.name);
    }

    async handleConnection(client: NotificationsSocket): Promise<void> {
        let connection: AuthenticatedConnection;
        try {
            connection = this.authenticate(client);
        } catch (error: unknown) {
            if (!(error instanceof ConnectionRejectedError)) throw error;
            this.reject(client, error);
            return;
        }
        await client.join(userRoom(connection.userId));
        this.open(client, connection);
    }

    emitToUser(userId: string, event: RealtimeEvent): void {
        if (this.namespace === undefined) {
            throw new RealtimeServerNotReadyError('Realtime server is not initialized');
        }
        const room = this.namespace.to(userRoom(userId));
        switch (event.name) {
            case NOTIFICATION_CREATED_REALTIME_EVENT:
                room.emit(NOTIFICATION_CREATED_REALTIME_EVENT, event.payload);
                return;
            case NOTIFICATION_READ_REALTIME_EVENT:
                room.emit(NOTIFICATION_READ_REALTIME_EVENT, event.payload);
                return;
        }
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
