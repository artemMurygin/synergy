import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../shared/config/env.schema';
import { AssistantModule } from '../../assistant/assistant.module';
import { TranscriptionModule } from '../transcription.module';
import { MeetingChatEventSubscriptions } from './application/meeting-chat-event-subscriptions';
import {
    NotifyChatOnTranscriptFinished,
    NotifyChatOnTranscriptFinishedSettings,
} from './application/notify-chat-on-transcript-finished.subscriber';
import { MeetingChatPort } from './domain/ports/meeting-chat.port';
import { AssistantMeetingChat } from './infrastructure/assistant/assistant-meeting-chat';

/**
 * Сообщение в чат по результату расшифровки. Отдельный модуль, потому что `assistant` сам
 * зависит от `transcription` (специалист по встречам): так зависимости остаются без цикла.
 */
@Module({
    imports: [TranscriptionModule, AssistantModule],
    providers: [
        NotifyChatOnTranscriptFinished,
        MeetingChatEventSubscriptions,
        { provide: MeetingChatPort, useClass: AssistantMeetingChat },
        {
            provide: NotifyChatOnTranscriptFinishedSettings,
            inject: [ConfigService],
            useFactory: (
                config: ConfigService<Env, true>,
            ): NotifyChatOnTranscriptFinishedSettings => ({
                maxRecordingSec: config.get('MEETING_TRANSCRIPTION_MAX_DURATION_SEC', {
                    infer: true,
                }),
            }),
        },
    ],
})
export class MeetingChatModule {}
