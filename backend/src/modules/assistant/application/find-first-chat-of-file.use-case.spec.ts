import { describe, expect, it } from 'vitest';
import { ChatSession } from '../domain/chat-session';
import { InMemoryChatSessionRepository } from '../interface/http/testing/in-memory-chat-session-repository';
import { FindFirstChatOfFileUseCase } from './find-first-chat-of-file.use-case';

const OWNER = 'owner-1';

describe('FindFirstChatOfFileUseCase', () => {
    it('returns the first chat of the owner where the file was sent, and null after it is deleted', async () => {
        const sessions = new InMemoryChatSessionRepository();
        const useCase = new FindFirstChatOfFileUseCase(sessions);
        const first = await sessions.create(ChatSession.create({ ownerId: OWNER, channel: 'app' }));
        const second = await sessions.create(
            ChatSession.create({ ownerId: OWNER, channel: 'app' }),
        );
        await sessions.appendUserMessage(first.id, OWNER, '', ['rec-1']);
        await sessions.appendUserMessage(second.id, OWNER, 'ещё раз', ['rec-1']);

        expect(await useCase.execute({ ownerId: OWNER, fileId: 'rec-1' })).toBe(first.id);
        expect(await useCase.execute({ ownerId: 'stranger', fileId: 'rec-1' })).toBeNull();
        expect(await useCase.execute({ ownerId: OWNER, fileId: 'other' })).toBeNull();

        await sessions.delete(first.id, OWNER);
        expect(await useCase.execute({ ownerId: OWNER, fileId: 'rec-1' })).toBe(second.id);
        await sessions.delete(second.id, OWNER);
        expect(await useCase.execute({ ownerId: OWNER, fileId: 'rec-1' })).toBeNull();
    });
});
