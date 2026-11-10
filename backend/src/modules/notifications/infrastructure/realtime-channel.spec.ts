import { describe, expect, it } from 'vitest';
import { toNotificationDto } from '../application/notification-view';
import { makeNotification, RecordingRealtimeEmitter } from '../application/test-doubles';
import { RealtimeChannel } from './realtime-channel';

describe('RealtimeChannel', () => {
    it('is the realtime channel', () => {
        expect(new RealtimeChannel(new RecordingRealtimeEmitter()).channel).toBe('realtime');
    });

    it('sends notification.created with the notification and the unread count to the recipient', async () => {
        const emitter = new RecordingRealtimeEmitter();
        const notification = makeNotification({ recipientId: 'boris' });

        await new RealtimeChannel(emitter).deliver(notification, 3);

        expect(emitter.emitted).toEqual([
            {
                userId: 'boris',
                event: {
                    name: 'notification.created',
                    payload: { notification: toNotificationDto(notification), unreadCount: 3 },
                },
            },
        ]);
    });

    it('lets an emitter failure through so the outbox retries the delivery', async () => {
        const emitter = new RecordingRealtimeEmitter();
        emitter.failure = new Error('redis is down');

        await expect(new RealtimeChannel(emitter).deliver(makeNotification(), 1)).rejects.toThrow(
            'redis is down',
        );
    });
});
