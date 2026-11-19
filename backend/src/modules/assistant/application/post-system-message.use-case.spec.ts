import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryTransactionRunner } from '../../../database/postgres/testing/in-memory-transaction-runner';
import { AttachmentRef } from '../../../shared/agent-capability';
import type { DomainEvent, DomainEventPublisherPort } from '../../../shared/ddd';
import { ChatSystemMessagePostedEvent } from '../contracts/chat-system-message-posted.event';
import type { SystemMessageCommand } from '../contracts/system-message.command';
import { ChatSession } from '../domain/chat-session';
import { ChatSessionNotFoundError } from '../domain/chat-session-not-found.error';
import { AttachmentFilesPort } from '../domain/ports/attachment-files.port';
import { AgentContextWriterPort } from '../domain/ports/agent-context-writer.port';
import { ChatThreadPort } from '../domain/ports/chat-thread.port';
import { RunInProgressError } from '../domain/run-in-progress.error';
import { ActiveRunRegistry } from '../infrastructure/active-run-registry';
import { InMemoryChatSessionRepository } from '../interface/http/testing/in-memory-chat-session-repository';
import { PostSystemMessageUseCase } from './post-system-message.use-case';

const OWNER = 'owner-1';

class FakeThread extends ChatThreadPort {
    deleted: string[] = [];
    deleteThread(sessionId: string): Promise<void> {
        this.deleted.push(sessionId);
        return Promise.resolve();
    }
    latestCheckpointId(): Promise<string | null> {
        return Promise.resolve(null);
    }
}

class FakeContext extends AgentContextWriterPort {
    appended: { sessionId: string; text: string }[] = [];
    constructor(private readonly calls: string[]) {
        super();
    }
    appendAssistantMessage(sessionId: string, text: string): Promise<void> {
        this.calls.push('checkpointer');
        this.appended.push({ sessionId, text });
        return Promise.resolve();
    }
}

class FakeFiles extends AttachmentFilesPort {
    findOwned(_ownerId: string, fileIds: readonly string[]): Promise<AttachmentRef[]> {
        return Promise.resolve(
            fileIds.map((fileId) =>
                AttachmentRef.of({
                    fileId,
                    name: 'Расшифровка.docx',
                    mediaType:
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    kind: 'document',
                    sizeBytes: 2048,
                }),
            ),
        );
    }
}

describe('PostSystemMessageUseCase', () => {
    let calls: string[];
    let sessions: InMemoryChatSessionRepository;
    let thread: FakeThread;
    let context: FakeContext;
    let registry: ActiveRunRegistry;
    let published: DomainEvent[];
    let transactions: InMemoryTransactionRunner;
    let useCase: PostSystemMessageUseCase;
    let session: ChatSession;

    function command(overrides: Partial<SystemMessageCommand> = {}): SystemMessageCommand {
        return {
            sessionId: session.id,
            ownerId: OWNER,
            text: 'Расшифровка «встреча.m4a» готова: 2 спикера, 00:42:10.',
            attachments: ['doc-1'],
            dedupKey: 'event-1',
            topic: 'meeting-transcript.ready',
            subject: { fileId: 'rec-1', fileName: 'встреча.m4a' },
            ...overrides,
        };
    }

    beforeEach(async () => {
        calls = [];
        sessions = new InMemoryChatSessionRepository();
        const append = sessions.appendSystemMessage.bind(sessions);
        sessions.appendSystemMessage = (...args) => {
            calls.push('row');
            return append(...args);
        };
        thread = new FakeThread();
        context = new FakeContext(calls);
        registry = new ActiveRunRegistry();
        published = [];
        transactions = new InMemoryTransactionRunner();
        const events: DomainEventPublisherPort = {
            publish: (list: readonly DomainEvent[]) => {
                if (!transactions.isInTransaction()) throw new Error('outside a transaction');
                calls.push('event');
                published.push(...list);
                return Promise.resolve();
            },
        };
        useCase = new PostSystemMessageUseCase(
            sessions,
            registry,
            context,
            thread,
            new FakeFiles(),
            transactions,
            events,
            { setContext: vi.fn(), warn: vi.fn(), info: vi.fn() } as unknown as PinoLogger,
        );
        session = await sessions.create(ChatSession.create({ ownerId: OWNER, channel: 'app' }));
    });

    it('posts into a free chat: checkpointer first, then the row and the event', async () => {
        expect(await useCase.execute(command())).toBe('posted');

        expect(calls).toEqual(['checkpointer', 'row', 'event']);
        const [message] = await sessions.listMessages(session.id, OWNER);
        expect(message).toMatchObject({
            role: 'agent',
            source: 'system',
            text: command().text,
            dedupKey: 'event-1',
        });
        expect(message.attachments.map((a) => a.fileId)).toEqual(['doc-1']);
    });

    it('gives the agent the text with the [Вложения] block of the attached documents', async () => {
        await useCase.execute(command());
        expect(context.appended).toEqual([
            {
                sessionId: session.id,
                text: `${command().text}\n\n[Вложения]\n1. id=doc-1; Расшифровка.docx; document; 2 КБ`,
            },
        ]);
    });

    it('publishes ChatSystemMessagePosted without the message text', async () => {
        await useCase.execute(command());
        expect(published).toHaveLength(1);
        const event = published[0] as ChatSystemMessagePostedEvent;
        expect(event).toBeInstanceOf(ChatSystemMessagePostedEvent);
        const [message] = await sessions.listMessages(session.id, OWNER);
        expect(event).toMatchObject({
            aggregateId: session.id,
            ownerId: OWNER,
            messageId: message.id,
            topic: 'meeting-transcript.ready',
            subject: { fileId: 'rec-1', fileName: 'встреча.m4a' },
        });
        expect(JSON.stringify(event)).not.toContain('спикера');
    });

    it('throws RunInProgressError while the chat has an active run and writes nothing', async () => {
        registry.tryStart(session.id, 'run-1');
        await expect(useCase.execute(command())).rejects.toBeInstanceOf(RunInProgressError);
        expect(calls).toEqual([]);
        expect(await sessions.listMessages(session.id, OWNER)).toEqual([]);
    });

    it('a run started during the write waits until the message is saved', async () => {
        let finishCheckpointer: () => void = () => undefined;
        context.appendAssistantMessage = (sessionId, text) => {
            calls.push('checkpointer');
            context.appended.push({ sessionId, text });
            return new Promise<void>((resolve) => {
                finishCheckpointer = resolve;
            });
        };
        const posting = useCase.execute(command());
        await vi.waitFor(() => {
            expect(calls).toEqual(['checkpointer']);
        });

        const starting = registry.startAfterSystemMessages(session.id, 'run-1').then((run) => {
            calls.push('run');
            return run;
        });
        await Promise.resolve();
        expect(registry.isRunning(session.id)).toBe(false);

        finishCheckpointer();
        expect(await posting).toBe('posted');
        expect(await starting).not.toBeNull();
        expect(calls).toEqual(['checkpointer', 'row', 'event', 'run']);
    });

    it('releases the chat when the write fails', async () => {
        context.appendAssistantMessage = () => Promise.reject(new Error('checkpointer is down'));
        await expect(useCase.execute(command())).rejects.toThrow('checkpointer is down');
        expect(await registry.startAfterSystemMessages(session.id, 'run-1')).not.toBeNull();
    });

    it('releases the chat after a duplicate and after a deleted chat', async () => {
        await useCase.execute(command());
        expect(await useCase.execute(command())).toBe('duplicate');
        sessions.appendSystemMessage = () =>
            Promise.reject(new ChatSessionNotFoundError(session.id));
        expect(await useCase.execute(command({ dedupKey: 'event-2' }))).toBe('skipped');
        expect(await registry.startAfterSystemMessages(session.id, 'run-1')).not.toBeNull();
    });

    it('a repeated dedup key is a duplicate and does not touch the checkpointer again', async () => {
        await useCase.execute(command());
        calls.length = 0;
        expect(await useCase.execute(command())).toBe('duplicate');
        expect(calls).toEqual([]);
        expect(await sessions.listMessages(session.id, OWNER)).toHaveLength(1);
        expect(published).toHaveLength(1);
    });

    it('a concurrent duplicate found on insert publishes nothing', async () => {
        sessions.appendSystemMessage = () => Promise.resolve(null);
        expect(await useCase.execute(command())).toBe('duplicate');
        expect(published).toEqual([]);
    });

    it('skips a deleted chat without writing anything', async () => {
        await sessions.delete(session.id, OWNER);
        expect(await useCase.execute(command())).toBe('skipped');
        expect(calls).toEqual([]);
    });

    it('skips a chat of another owner and a Telegram dialog', async () => {
        expect(await useCase.execute(command({ ownerId: 'stranger' }))).toBe('skipped');
        const telegram = await sessions.findOrCreateTelegram(OWNER);
        expect(await useCase.execute(command({ sessionId: telegram.id }))).toBe('skipped');
        expect(calls).toEqual([]);
    });

    it('skips and drops the written context when the chat is deleted after the checkpointer write', async () => {
        sessions.appendSystemMessage = () =>
            Promise.reject(new ChatSessionNotFoundError(session.id));
        expect(await useCase.execute(command())).toBe('skipped');
        expect(thread.deleted).toEqual([session.id]);
        expect(published).toEqual([]);
    });

    it('posts a message without attachments', async () => {
        expect(await useCase.execute(command({ attachments: [] }))).toBe('posted');
        expect(context.appended[0]?.text).toBe(command().text);
    });
});
