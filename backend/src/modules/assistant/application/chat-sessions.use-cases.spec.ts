import { describe, expect, it, vi } from 'vitest';
import { type ChatMessage } from '../domain/chat-message';
import { ChatSession } from '../domain/chat-session';
import { ChatSessionNotFoundError } from '../domain/chat-session-not-found.error';
import { type ChatTitle, InvalidChatTitleError } from '../domain/chat-title';
import type { ActiveRunRegistryPort } from '../domain/ports/active-run-registry.port';
import type { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';
import type { ChatThreadPort } from '../domain/ports/chat-thread.port';
import { ActiveRunRegistry } from '../infrastructure/active-run-registry';
import { CancelAgentRunUseCase } from './cancel-agent-run.use-case';
import { CreateChatSessionUseCase } from './create-chat-session.use-case';
import { DeleteChatSessionUseCase } from './delete-chat-session.use-case';
import { GetChatMessagesUseCase } from './get-chat-messages.use-case';
import { ListChatSessionsUseCase } from './list-chat-sessions.use-case';
import { RenameChatSessionUseCase } from './rename-chat-session.use-case';

class FakeRepository {
    readonly sessions = new Map<string, ChatSession>();
    readonly messages = new Map<string, ChatMessage[]>();

    create = vi.fn((session: ChatSession) => {
        this.sessions.set(session.id, session);
        this.messages.set(session.id, []);
        return Promise.resolve(session);
    });
    findOwned = vi.fn((id: string, ownerId: string) => {
        const session = this.sessions.get(id);
        return Promise.resolve(session?.ownerId === ownerId ? session : null);
    });
    list = vi.fn((ownerId: string) =>
        Promise.resolve(
            [...this.sessions.values()].filter((s) => s.ownerId === ownerId && s.channel === 'app'),
        ),
    );
    listMessages = vi.fn((id: string, _ownerId: string) => {
        const list = this.messages.get(id);
        return list ? Promise.resolve(list) : Promise.reject(new ChatSessionNotFoundError(id));
    });
    rename = vi.fn((id: string, _ownerId: string, title: ChatTitle) => {
        const session = this.sessions.get(id);
        if (!session) return Promise.reject(new ChatSessionNotFoundError(id));
        const renamed = session.rename(title);
        this.sessions.set(id, renamed);
        return Promise.resolve(renamed);
    });
    delete = vi.fn((id: string, _ownerId: string) => {
        if (!this.sessions.delete(id)) return Promise.reject(new ChatSessionNotFoundError(id));
        this.messages.delete(id);
        return Promise.resolve();
    });
}

const OWNER = 'user-1';
const OTHER = 'user-2';

function setup(): {
    repo: FakeRepository;
    deleteThread: ReturnType<typeof vi.fn>;
    port: ChatSessionRepositoryPort;
    thread: ChatThreadPort;
    registry: ActiveRunRegistryPort;
} {
    const repo = new FakeRepository();
    const deleteThread = vi.fn().mockResolvedValue(undefined);
    return {
        repo,
        deleteThread,
        port: repo as unknown as ChatSessionRepositoryPort,
        thread: { deleteThread, latestCheckpointId: () => Promise.resolve(null) },
        registry: new ActiveRunRegistry(),
    };
}

describe('CreateChatSessionUseCase', () => {
    it('creates a session with the default title', async () => {
        const { port } = setup();
        const session = await new CreateChatSessionUseCase(port).execute(OWNER);
        expect(session.title.isDefault()).toBe(true);
        expect(session.titleIsCustom).toBe(false);
    });

    it('creates a session with a custom title', async () => {
        const { port, repo } = setup();
        const session = await new CreateChatSessionUseCase(port).execute(OWNER, '  Цены на МВА ');
        expect(session.title.value).toBe('Цены на МВА');
        expect(session.titleIsCustom).toBe(true);
        expect(repo.sessions.has(session.id)).toBe(true);
    });

    it('rejects an invalid title', async () => {
        const { port, repo } = setup();
        await expect(
            new CreateChatSessionUseCase(port).execute(OWNER, '   '),
        ).rejects.toBeInstanceOf(InvalidChatTitleError);
        expect(repo.create).not.toHaveBeenCalled();
    });
});

describe('ListChatSessionsUseCase', () => {
    it('returns the sessions of the repository', async () => {
        const { port, registry } = setup();
        const created = await new CreateChatSessionUseCase(port).execute(OWNER);
        await expect(new ListChatSessionsUseCase(port, registry).execute(OWNER)).resolves.toEqual([
            { session: created, running: false },
        ]);
    });

    it('marks only the chat with an active run as running', async () => {
        const { port, registry } = setup();
        const busy = await new CreateChatSessionUseCase(port).execute(OWNER);
        const idle = await new CreateChatSessionUseCase(port).execute(OWNER);
        registry.tryStart(busy.id, 'run-1');
        const items = await new ListChatSessionsUseCase(port, registry).execute(OWNER);
        expect(items.find((i) => i.session.id === busy.id)?.running).toBe(true);
        expect(items.find((i) => i.session.id === idle.id)?.running).toBe(false);
    });

    it('resets running when the run is cancelled and released', async () => {
        const { port, registry } = setup();
        const session = await new CreateChatSessionUseCase(port).execute(OWNER);
        registry.tryStart(session.id, 'run-1');
        registry.release(session.id, 'run-1');
        const items = await new ListChatSessionsUseCase(port, registry).execute(OWNER);
        expect(items[0]?.running).toBe(false);
    });
});

describe('GetChatMessagesUseCase', () => {
    it('returns the history of a session', async () => {
        const { port, registry } = setup();
        const session = await new CreateChatSessionUseCase(port).execute(OWNER);
        await expect(
            new GetChatMessagesUseCase(port, registry).execute(OWNER, session.id),
        ).resolves.toEqual({ messages: [], running: false });
    });

    it('reads the history on behalf of the owner', async () => {
        const { port, repo, registry } = setup();
        const session = await new CreateChatSessionUseCase(port).execute(OWNER);
        await new GetChatMessagesUseCase(port, registry).execute(OWNER, session.id);
        expect(repo.listMessages).toHaveBeenCalledWith(session.id, OWNER);
    });

    it('reports running while the chat has an active run', async () => {
        const { port, registry } = setup();
        const session = await new CreateChatSessionUseCase(port).execute(OWNER);
        registry.tryStart(session.id, 'run-1');
        const result = await new GetChatMessagesUseCase(port, registry).execute(OWNER, session.id);
        expect(result.running).toBe(true);
    });

    it('never reports a finished run together with a history that lacks its answer', async () => {
        const { port, registry } = setup();
        const session = await new CreateChatSessionUseCase(port).execute(OWNER);
        registry.tryStart(session.id, 'run-1');
        const answer = { role: 'assistant' } as unknown as ChatMessage;
        const messages: ChatMessage[] = [];
        const staleSnapshot = [...messages];
        vi.spyOn(port, 'listMessages').mockImplementation(() => {
            messages.push(answer);
            registry.release(session.id, 'run-1');
            return Promise.resolve(staleSnapshot);
        });
        const result = await new GetChatMessagesUseCase(port, registry).execute(OWNER, session.id);
        expect(result.running || result.messages.includes(answer)).toBe(true);
    });

    it('fails with not found for an unknown session', async () => {
        const { port, registry } = setup();
        await expect(
            new GetChatMessagesUseCase(port, registry).execute(OWNER, 'nope'),
        ).rejects.toBeInstanceOf(ChatSessionNotFoundError);
    });
});

describe('RenameChatSessionUseCase', () => {
    it('renames and marks the title as custom', async () => {
        const { port } = setup();
        const session = await new CreateChatSessionUseCase(port).execute(OWNER);
        const renamed = await new RenameChatSessionUseCase(port).execute(
            OWNER,
            session.id,
            ' Новое ',
        );
        expect(renamed.title.value).toBe('Новое');
        expect(renamed.titleIsCustom).toBe(true);
    });

    it('renames on behalf of the owner', async () => {
        const { port, repo } = setup();
        const session = await new CreateChatSessionUseCase(port).execute(OWNER);
        await new RenameChatSessionUseCase(port).execute(OWNER, session.id, 'Новое');
        expect(repo.rename).toHaveBeenCalledWith(session.id, OWNER, expect.anything());
    });

    it('rejects an invalid title without touching the repository', async () => {
        const { port, repo } = setup();
        await expect(
            new RenameChatSessionUseCase(port).execute(OWNER, 'any', 'я'.repeat(121)),
        ).rejects.toBeInstanceOf(InvalidChatTitleError);
        expect(repo.rename).not.toHaveBeenCalled();
    });

    it('fails with not found for an unknown session', async () => {
        const { port } = setup();
        await expect(
            new RenameChatSessionUseCase(port).execute(OWNER, 'nope', 'x'),
        ).rejects.toBeInstanceOf(ChatSessionNotFoundError);
    });
});

describe('DeleteChatSessionUseCase', () => {
    it('deletes the session and the agent thread', async () => {
        const { port, thread, repo, deleteThread, registry } = setup();
        const session = await new CreateChatSessionUseCase(port).execute(OWNER);
        await new DeleteChatSessionUseCase(port, thread, registry).execute(OWNER, session.id);
        expect(repo.sessions.has(session.id)).toBe(false);
        expect(deleteThread).toHaveBeenCalledWith(session.id);
        expect(repo.delete).toHaveBeenCalledWith(session.id, OWNER);
    });

    it('clears the thread before removing the session', async () => {
        const { port, thread, repo, deleteThread, registry } = setup();
        const session = await new CreateChatSessionUseCase(port).execute(OWNER);
        let sessionPresentAtThreadDelete = false;
        const record = (): Promise<void> => {
            sessionPresentAtThreadDelete = repo.sessions.has(session.id);
            return Promise.resolve();
        };
        deleteThread.mockImplementation(record as () => unknown);
        await new DeleteChatSessionUseCase(port, thread, registry).execute(OWNER, session.id);
        expect(sessionPresentAtThreadDelete).toBe(true);
    });

    it('keeps the session when clearing the thread fails, so delete can be retried', async () => {
        const { port, thread, repo, deleteThread, registry } = setup();
        const session = await new CreateChatSessionUseCase(port).execute(OWNER);
        deleteThread.mockRejectedValueOnce(new Error('connection lost'));
        const useCase = new DeleteChatSessionUseCase(port, thread, registry);
        await expect(useCase.execute(OWNER, session.id)).rejects.toThrow('connection lost');
        expect(repo.sessions.has(session.id)).toBe(true);
        await useCase.execute(OWNER, session.id);
        expect(repo.sessions.has(session.id)).toBe(false);
    });

    it('fails with not found on a repeated delete and leaves the thread alone', async () => {
        const { port, thread, deleteThread, registry } = setup();
        const session = await new CreateChatSessionUseCase(port).execute(OWNER);
        const useCase = new DeleteChatSessionUseCase(port, thread, registry);
        await useCase.execute(OWNER, session.id);
        deleteThread.mockClear();
        await expect(useCase.execute(OWNER, session.id)).rejects.toBeInstanceOf(
            ChatSessionNotFoundError,
        );
        expect(deleteThread).not.toHaveBeenCalled();
    });
});

describe('DeleteChatSessionUseCase with an active run', () => {
    it('cancels the active run before clearing the thread and removing the session', async () => {
        const { port, thread, repo, deleteThread, registry } = setup();
        const session = await new CreateChatSessionUseCase(port).execute(OWNER);
        const run = registry.tryStart(session.id, 'run-1');
        let abortedAtThreadDelete = false;
        let sessionPresentAtThreadDelete = false;
        deleteThread.mockImplementation((() => {
            abortedAtThreadDelete = run?.signal.aborted ?? false;
            sessionPresentAtThreadDelete = repo.sessions.has(session.id);
            return Promise.resolve();
        }) as () => unknown);
        await new DeleteChatSessionUseCase(port, thread, registry).execute(OWNER, session.id);
        expect(abortedAtThreadDelete).toBe(true);
        expect(sessionPresentAtThreadDelete).toBe(true);
        expect(run?.status).toBe('cancelled');
        expect(repo.sessions.has(session.id)).toBe(false);
    });

    it('does not touch the run of another chat', async () => {
        const { port, thread, registry } = setup();
        const doomed = await new CreateChatSessionUseCase(port).execute(OWNER);
        const other = await new CreateChatSessionUseCase(port).execute(OWNER);
        const otherRun = registry.tryStart(other.id, 'run-2');
        await new DeleteChatSessionUseCase(port, thread, registry).execute(OWNER, doomed.id);
        expect(otherRun?.status).toBe('running');
    });
});

describe('CancelAgentRunUseCase', () => {
    it('aborts the active run of the chat', async () => {
        const { registry, port } = setup();
        const session = await new CreateChatSessionUseCase(port).execute(OWNER);
        const run = registry.tryStart(session.id, 'run-1');
        await new CancelAgentRunUseCase(port, registry).execute(OWNER, session.id);
        expect(run?.status).toBe('cancelled');
        expect(run?.signal.aborted).toBe(true);
    });

    it('does not fail when the chat has no active run', async () => {
        const { registry, port } = setup();
        const session = await new CreateChatSessionUseCase(port).execute(OWNER);
        await expect(
            new CancelAgentRunUseCase(port, registry).execute(OWNER, session.id),
        ).resolves.toBeUndefined();
    });

    it('is idempotent', async () => {
        const { registry, port } = setup();
        const session = await new CreateChatSessionUseCase(port).execute(OWNER);
        registry.tryStart(session.id, 'run-1');
        const useCase = new CancelAgentRunUseCase(port, registry);
        await useCase.execute(OWNER, session.id);
        await expect(useCase.execute(OWNER, session.id)).resolves.toBeUndefined();
    });

    it('fails with not found for an unknown chat', async () => {
        const { registry, port } = setup();
        await expect(
            new CancelAgentRunUseCase(port, registry).execute(OWNER, 'nope'),
        ).rejects.toBeInstanceOf(ChatSessionNotFoundError);
    });
});

describe('ownership', () => {
    async function foreignChat(): Promise<ReturnType<typeof setup> & { id: string }> {
        const ctx = setup();
        const session = await new CreateChatSessionUseCase(ctx.port).execute(OTHER, 'Чужой');
        return { ...ctx, id: session.id };
    }

    it('creates the chat for the given owner in the app channel', async () => {
        const { port } = setup();
        const session = await new CreateChatSessionUseCase(port).execute(OWNER);
        expect(session.ownerId).toBe(OWNER);
        expect(session.channel).toBe('app');
    });

    it('lists only the chats of the owner', async () => {
        const { port, registry } = setup();
        const mine = await new CreateChatSessionUseCase(port).execute(OWNER);
        await new CreateChatSessionUseCase(port).execute(OTHER);
        const items = await new ListChatSessionsUseCase(port, registry).execute(OWNER);
        expect(items.map((i) => i.session.id)).toEqual([mine.id]);
    });

    it('does not list the Telegram dialog of the owner', async () => {
        const { port, registry, repo } = setup();
        const telegram = ChatSession.create({ ownerId: OWNER, channel: 'telegram' });
        await repo.create(telegram);
        await expect(new ListChatSessionsUseCase(port, registry).execute(OWNER)).resolves.toEqual(
            [],
        );
    });

    it('serves a chat created by the same user to any application', async () => {
        const { port, registry } = setup();
        const session = await new CreateChatSessionUseCase(port).execute(OWNER);
        await expect(
            new GetChatMessagesUseCase(port, registry).execute(OWNER, session.id),
        ).resolves.toEqual({ messages: [], running: false });
    });

    it('hides a foreign chat history as not found', async () => {
        const { port, registry, id, repo } = await foreignChat();
        await expect(
            new GetChatMessagesUseCase(port, registry).execute(OWNER, id),
        ).rejects.toBeInstanceOf(ChatSessionNotFoundError);
        expect(repo.listMessages).not.toHaveBeenCalled();
    });

    it('hides the Telegram dialog by id as not found', async () => {
        const { port, registry, repo } = setup();
        const telegram = ChatSession.create({ ownerId: OWNER, channel: 'telegram' });
        await repo.create(telegram);
        await expect(
            new GetChatMessagesUseCase(port, registry).execute(OWNER, telegram.id),
        ).rejects.toBeInstanceOf(ChatSessionNotFoundError);
        await expect(
            new RenameChatSessionUseCase(port).execute(OWNER, telegram.id, 'x'),
        ).rejects.toBeInstanceOf(ChatSessionNotFoundError);
        await expect(
            new CancelAgentRunUseCase(port, registry).execute(OWNER, telegram.id),
        ).rejects.toBeInstanceOf(ChatSessionNotFoundError);
        expect(repo.sessions.has(telegram.id)).toBe(true);
    });

    it('does not rename a foreign chat', async () => {
        const { port, id, repo } = await foreignChat();
        await expect(
            new RenameChatSessionUseCase(port).execute(OWNER, id, 'Мой'),
        ).rejects.toBeInstanceOf(ChatSessionNotFoundError);
        expect(repo.rename).not.toHaveBeenCalled();
        expect(repo.sessions.get(id)?.title.value).toBe('Чужой');
    });

    it('does not delete a foreign chat, its thread or its run', async () => {
        const { port, thread, registry, id, repo, deleteThread } = await foreignChat();
        const run = registry.tryStart(id, 'run-1');
        await expect(
            new DeleteChatSessionUseCase(port, thread, registry).execute(OWNER, id),
        ).rejects.toBeInstanceOf(ChatSessionNotFoundError);
        expect(repo.sessions.has(id)).toBe(true);
        expect(deleteThread).not.toHaveBeenCalled();
        expect(run?.status).toBe('running');
    });

    it('does not cancel the run of a foreign chat', async () => {
        const { port, registry, id } = await foreignChat();
        const run = registry.tryStart(id, 'run-1');
        await expect(
            new CancelAgentRunUseCase(port, registry).execute(OWNER, id),
        ).rejects.toBeInstanceOf(ChatSessionNotFoundError);
        expect(run?.status).toBe('running');
    });
});
