import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../../../domain/chat-message';
import { ChatSession } from '../../../domain/chat-session';
import { ChatSessionNotFoundError } from '../../../domain/chat-session-not-found.error';
import { MessageNotFoundError } from '../../../domain/message-not-found.error';
import { MessageNotRewindableError } from '../../../domain/message-not-rewindable.error';
import { InMemoryChatSessionRepository } from './in-memory-chat-session-repository';

const OWNER = 'owner-1';

async function twoPairs(
    repo: InMemoryChatSessionRepository,
): Promise<{ s: ChatSession; q1: ChatMessage; q2: ChatMessage }> {
    const s = await repo.create(ChatSession.create({ ownerId: OWNER, channel: 'app' }));
    const q1 = await repo.appendUserMessage(s.id, OWNER, 'q1', ['f1'], { checkpointId: null });
    await repo.appendAgentAnswer(s.id, OWNER, { answer: 'a1', toolCalls: [], durationMs: 1 });
    const q2 = await repo.appendUserMessage(s.id, OWNER, 'q2', [], { checkpointId: 'cp-1' });
    await repo.appendAgentAnswer(s.id, OWNER, { answer: 'a2', toolCalls: [], durationMs: 1 });
    return { s, q1, q2 };
}

describe('InMemoryChatSessionRepository rewind', () => {
    it('stores rewind points; a question without one is not rewindable', async () => {
        const repo = new InMemoryChatSessionRepository();
        const { s, q2 } = await twoPairs(repo);
        const old = await repo.appendUserMessage(s.id, OWNER, 'old');
        expect(q2.agentCheckpointId).toBe('cp-1');
        expect(old.rewindable).toBe(false);
    });

    it('findRewindPoint returns the point, the files in order and the checkpoint', async () => {
        const repo = new InMemoryChatSessionRepository();
        const { s, q1, q2 } = await twoPairs(repo);
        expect(await repo.findRewindPoint(s.id, OWNER, String(q1.id))).toEqual({
            messageId: String(q1.id),
            attachments: ['f1'],
            checkpointId: null,
        });
        expect((await repo.findRewindPoint(s.id, OWNER, String(q2.id))).checkpointId).toBe('cp-1');
    });

    it('findRewindPoint: not found for an agent, a foreign and an unknown message; not rewindable for an old one', async () => {
        const repo = new InMemoryChatSessionRepository();
        const { s } = await twoPairs(repo);
        const old = await repo.appendUserMessage(s.id, OWNER, 'old');
        const [, agent] = await repo.listMessages(s.id, OWNER);
        await expect(repo.findRewindPoint(s.id, OWNER, String(agent.id))).rejects.toBeInstanceOf(
            MessageNotFoundError,
        );
        await expect(repo.findRewindPoint(s.id, OWNER, '9999')).rejects.toBeInstanceOf(
            MessageNotFoundError,
        );
        await expect(repo.findRewindPoint(s.id, 'stranger', '1')).rejects.toBeInstanceOf(
            ChatSessionNotFoundError,
        );
        await expect(repo.findRewindPoint(s.id, OWNER, String(old.id))).rejects.toBeInstanceOf(
            MessageNotRewindableError,
        );
    });

    it('replaceFrom drops the message and what follows and appends the new question', async () => {
        const repo = new InMemoryChatSessionRepository();
        const { s, q2 } = await twoPairs(repo);
        const replaced = await repo.replaceFrom(s.id, OWNER, String(q2.id), {
            text: 'новый q2',
            attachments: [],
            checkpointId: 'cp-1',
        });
        const messages = await repo.listMessages(s.id, OWNER);
        expect(messages.map((m) => m.text)).toEqual(['q1', 'a1', 'новый q2']);
        expect(replaced.rewindable).toBe(true);
        expect(replaced.agentCheckpointId).toBe('cp-1');
    });

    it('replaceFrom changes nothing when the message cannot be replaced', async () => {
        const repo = new InMemoryChatSessionRepository();
        const { s } = await twoPairs(repo);
        await expect(
            repo.replaceFrom(s.id, OWNER, '9999', {
                text: 'x',
                attachments: [],
                checkpointId: null,
            }),
        ).rejects.toBeInstanceOf(MessageNotFoundError);
        expect(await repo.listMessages(s.id, OWNER)).toHaveLength(4);
    });
});
