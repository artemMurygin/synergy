import type { Namespace, Socket } from 'socket.io';
import type { ConnectionRejectionReason } from '../../application/ports/connection-authenticator.port';
import type {
    NotificationCreatedRealtimeEvent,
    NotificationReadRealtimeEvent,
} from '../../application/ports/user-realtime-emitter.port';

export const NOTIFICATIONS_NAMESPACE = '/notifications';
export const CONNECTION_ERROR_EVENT = 'connection_error';
export const AUTH_EXPIRED_EVENT = 'auth_expired';
export const SERVER_ERROR_CODE = 'server_error';

export type ConnectionErrorCode = ConnectionRejectionReason | typeof SERVER_ERROR_CODE;

export interface ServerToClientEvents {
    'notification.created': (payload: NotificationCreatedRealtimeEvent['payload']) => void;
    'notification.read': (payload: NotificationReadRealtimeEvent['payload']) => void;
    connection_error: (payload: { code: ConnectionErrorCode }) => void;
    auth_expired: () => void;
}

export type ClientToServerEvents = Record<string, never>;

export type NotificationsNamespace = Namespace<ClientToServerEvents, ServerToClientEvents>;

export type NotificationsSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function userRoom(userId: string): string {
    return `user:${userId}`;
}
