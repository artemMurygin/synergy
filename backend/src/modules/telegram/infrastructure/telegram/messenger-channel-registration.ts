import { Injectable, type OnModuleInit } from '@nestjs/common';
import { NotificationChannelSubscriptions } from '../../../notifications/application/notification-channel-subscriptions';
import { MessengerChannel } from './messenger.channel';

@Injectable()
export class MessengerChannelRegistration implements OnModuleInit {
    constructor(
        private readonly subscriptions: NotificationChannelSubscriptions,
        private readonly channel: MessengerChannel,
    ) {}

    onModuleInit(): void {
        this.subscriptions.register(this.channel);
    }
}
