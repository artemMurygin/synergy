import { Injectable } from '@nestjs/common';
import { FindFirstChatOfFileUseCase } from '../../../../assistant/application/find-first-chat-of-file.use-case';
import { PostSystemMessagePort } from '../../../../assistant/contracts/post-system-message.port';
import {
    MeetingChatPort,
    type MeetingChatMessage,
    type RecordingOfOwner,
} from '../../domain/ports/meeting-chat.port';

/** `MeetingChatPort` поверх контрактов модуля `assistant`. */
@Injectable()
export class AssistantMeetingChat extends MeetingChatPort {
    constructor(
        private readonly findFirstChat: FindFirstChatOfFileUseCase,
        private readonly postSystemMessage: PostSystemMessagePort,
    ) {
        super();
    }

    findChatOfRecording({ ownerId, fileId }: RecordingOfOwner): Promise<string | null> {
        return this.findFirstChat.execute({ ownerId, fileId });
    }

    post(message: MeetingChatMessage): Promise<void> {
        return this.postSystemMessage.request({
            sessionId: message.chatId,
            ownerId: message.ownerId,
            text: message.text,
            attachments: [...message.attachments],
            dedupKey: message.dedupKey,
            topic: message.topic,
            subject: { fileId: message.recording.fileId, fileName: message.recording.fileName },
        });
    }
}
