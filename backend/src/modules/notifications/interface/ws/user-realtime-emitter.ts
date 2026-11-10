import { Injectable } from '@nestjs/common';
import {
    type RealtimeEvent,
    UserRealtimeEmitterPort,
} from '../../application/ports/user-realtime-emitter.port';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class UserRealtimeEmitter extends UserRealtimeEmitterPort {
    constructor(private readonly gateway: NotificationsGateway) {
        super();
    }

    emitToUser(userId: string, event: RealtimeEvent): Promise<void> {
        this.gateway.emitToUser(userId, event);
        return Promise.resolve();
    }
}
