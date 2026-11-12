import { describe, expect, it, vi } from 'vitest';
import type { FindFirstChatOfFileUseCase } from '../../../../assistant/application/find-first-chat-of-file.use-case';
import { AssistantMeetingChat } from './assistant-meeting-chat';

describe('AssistantMeetingChat', () => {
    const findFirstChat = { execute: vi.fn() };
    const postSystemMessage = { request: vi.fn() };
    const chat = new AssistantMeetingChat(
        findFirstChat as unknown as FindFirstChatOfFileUseCase,
        postSystemMessage,
    );

    it('finds the chat through the FindFirstChatOfFile contract', async () => {
        findFirstChat.execute.mockResolvedValue('chat-1');

        await expect(chat.findChatOfRecording({ ownerId: 'o-1', fileId: 'f-1' })).resolves.toBe(
            'chat-1',
        );
        expect(findFirstChat.execute).toHaveBeenCalledWith({ ownerId: 'o-1', fileId: 'f-1' });
    });

    it('posts through the PostSystemMessage contract with the recording as the subject', async () => {
        postSystemMessage.request.mockResolvedValue(undefined);

        await chat.post({
            chatId: 'chat-1',
            ownerId: 'o-1',
            text: 'Расшифровка готова',
            attachments: ['doc-1'],
            dedupKey: 'event-1',
            topic: 'meeting-transcript.ready',
            recording: { fileId: 'f-1', fileName: 'встреча.m4a' },
        });

        expect(postSystemMessage.request).toHaveBeenCalledWith({
            sessionId: 'chat-1',
            ownerId: 'o-1',
            text: 'Расшифровка готова',
            attachments: ['doc-1'],
            dedupKey: 'event-1',
            topic: 'meeting-transcript.ready',
            subject: { fileId: 'f-1', fileName: 'встреча.m4a' },
        });
    });
});
