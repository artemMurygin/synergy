import { describe, expect, it, vi } from 'vitest';
import { type ChatMessage } from '../domain/chat-message';
import { type ChatSession } from '../domain/chat-session';
import { ChatSessionNotFoundError } from '../domain/chat-session-not-found.error';
import { type ChatTitle, InvalidChatTitleError } from '../domain/chat-title';
import type { ActiveRunRegistryPort } from '../domain/ports/active-run-registry.port';
import type { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';
import type { ChatThreadPort } from '../domain/ports/chat-thread.port';
import { InMemoryActiveRunRegistry } from '../infrastructure/in-memory-active-run-registry';
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
    list = vi.fn(() => Promise.resolve([...this.sessions.values()]));
    listMessages = vi.fn((id: string) => {
        const list = this.messages.get(id);
        return list ? Promise.resolve(list) : Promise.reject(new ChatSessionNotFoundError(id));
    });
    rename = vi.fn((id: string, title: ChatTitle) => {
        const session = this.sessions.get(id);
        if (!session) return Promise.reject(new ChatSessionNotFoundError(id));
        const renamed = session.rename(title);
        this.sessions.set(id, renamed);
        return Promise.resolve(renamed);
    });
    delete = vi.fn((id: string) => {
        if (!this.sessions.delete(id)) return Promise.reject(new ChatSessionNotFoundError(id));
        this.messages.delete(id);
        return Promise.resolve();
    });
}

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
        thread: { deleteThread },
        registry: new InMemoryActiveRunRegistry(),
    };
}

describe('CreateChatSessionUseCase', () => {
    it('creates a session with the default title', async () => {
        const { port } = setup();
        const session = await new CreateChatSessionUseCase(port).execute();
        expect(session.title.isDefault()).toBe(true);
        expect(session.titleIsCustom).toBe(false);
    });

    it('creates a session with a custom title', async () => {
        const { port, repo } = setup();
        const session = await new CreateChatSessionUseCase(port).execute('  Цены на МВА ');
        expect(session.title.value).toBe('Цены на МВА');
        expect(session.titleIsCustom).toBe(true);
        expect(repo.sessions.has(session.id)).toBe(true);
    });

    it('rejects an invalid title', async () => {
        const { port, repo } = setup();
        await expect(new CreateChatSessionUseCase(port).execute('   ')).rejects.toBeInstanceOf(
            InvalidChatTitleError,
        );
        expect(repo.create).not.toHaveBeenCalled();
    });
});

describe('ListChatSessionsUseCase', () => {
    it('returns the sessions of the repository', async () => {
        const { port, registry } = setup();
        const created = await new CreateChatSessionUseCase(port).execute();
        await expect(new ListChatSessionsUseCase(port, registry).execute()).resolves.toEqual([
            { session: created, running: false },
        ]);
    });

    it('marks only the chat with an active run as running', async () => {
        const { port, registry } = setup();
        const busy = await new CreateChatSessionUseCase(port).execute();
        const idle = await new CreateChatSessionUseCase(port).execute();
        registry.tryStart(busy.id, 'run-1');
        const items = await new ListChatSessionsUseCase(port, registry).execute();
        expect(items.find((i) => i.session.id === busy.id)?.running).toBe(true);
        expect(items.find((i) => i.session.id === idle.id)?.running).toBe(false);
    });

    it('resets running when the run is cancelled and released', async () => {
        const { port, registry } = setup();
        const session = await new CreateChatSessionUseCase(port).execute();
        registry.tryStart(session.id, 'run-1');
        registry.release(session.id, 'run-1');
        const items = await new ListChatSessionsUseCase(port, registry).execute();
        expect(items[0]?.running).toBe(false);
    });
});

describe('GetChatMessagesUseCase', () => {
    it('returns the history of a session', async () => {
        const { port, registry } = setup();
        const session = await new CreateChatSessionUseCase(port).execute();
        await expect(
            new GetChatMessagesUseCase(port, registry).execute(session.id),
        ).resolves.toEqual({ messages: [], running: false });
    });

    it('reports running while the chat has an active run', async () => {
        const { port, registry } = setup();
        const session = await new CreateChatSessionUseCase(port).execute();
        registry.tryStart(session.id, 'run-1');
        const result = await new GetChatMessagesUseCase(port, registry).execute(session.id);
        expect(result.running).toBe(true);
    });

    it('never reports a finished run together with a history that lacks its answer', async () => {
        const { port, registry } = setup();
        const session = await new CreateChatSessionUseCase(port).execute();
        registry.tryStart(session.id, 'run-1');
        const answer = { role: 'assistant' } as unknown as ChatMessage;
        const messages: ChatMessage[] = [];
        const staleSnapshot = [...messages];
        vi.spyOn(port, 'listMessages').mockImplementation(() => {
            messages.push(answer);
            registry.release(session.id, 'run-1');
            return Promise.resolve(staleSnapshot);
        });
        const result = await new GetChatMessagesUseCase(port, registry).execute(session.id);
        expect(result.running || result.messages.includes(answer)).toBe(true);
    });

    it('fails with not found for an unknown session', async () => {
        const { port, registry } = setup();
        await expect(
            new GetChatMessagesUseCase(port, registry).execute('nope'),
        ).rejects.toBeInstanceOf(ChatSessionNotFoundError);
    });
});

describe('RenameChatSessionUseCase', () => {
    it('renames and marks the title as custom', async () => {
        const { port } = setup();
        const session = await new CreateChatSessionUseCase(port).execute();
        const renamed = await new RenameChatSessionUseCase(port).execute(session.id, ' Новое ');
        expect(renamed.title.value).toBe('Новое');
        expect(renamed.titleIsCustom).toBe(true);
    });

    it('rejects an invalid title without touching the repository', async () => {
        const { port, repo } = setup();
        await expect(
            new RenameChatSessionUseCase(port).execute('any', 'я'.repeat(121)),
        ).rejects.toBeInstanceOf(InvalidChatTitleError);
        expect(repo.rename).not.toHaveBeenCalled();
    });

    it('fails with not found for an unknown session', async () => {
        const { port } = setup();
        await expect(
            new RenameChatSessionUseCase(port).execute('nope', 'x'),
        ).rejects.toBeInstanceOf(ChatSessionNotFoundError);
    });
});

describe('DeleteChatSessionUseCase', () => {
    it('deletes the session and the agent thread', async () => {
        const { port, thread, repo, deleteThread, registry } = setup();
        const session = await new CreateChatSessionUseCase(port).execute();
        await new DeleteChatSessionUseCase(port, thread, registry).execute(session.id);
        expect(repo.sessions.has(session.id)).toBe(false);
        expect(deleteThread).toHaveBeenCalledWith(session.id);
    });

    it('clears the thread before removing the session', async () => {
        const { port, thread, repo, deleteThread, registry } = setup();
        const session = await new CreateChatSessionUseCase(port).execute();
        let sessionPresentAtThreadDelete = false;
        const record = (): Promise<void> => {
            sessionPresentAtThreadDelete = repo.sessions.has(session.id);
            return Promise.resolve();
        };
        deleteThread.mockImplementation(record as () => unknown);
        await new DeleteChatSessionUseCase(port, thread, registry).execute(session.id);
        expect(sessionPresentAtThreadDelete).toBe(true);
    });

    it('keeps the session when clearing the thread fails, so delete can be retried', async () => {
        const { port, thread, repo, deleteThread, registry } = setup();
        const session = await new CreateChatSessionUseCase(port).execute();
        deleteThread.mockRejectedValueOnce(new Error('connection lost'));
        const useCase = new DeleteChatSessionUseCase(port, thread, registry);
        await expect(useCase.execute(session.id)).rejects.toThrow('connection lost');
        expect(repo.sessions.has(session.id)).toBe(true);
        await useCase.execute(session.id);
        expect(repo.sessions.has(session.id)).toBe(false);
    });

    it('still clears the thread on a repeated delete, which fails with not found', async () => {
        const { port, thread, deleteThread, registry } = setup();
        const session = await new CreateChatSessionUseCase(port).execute();
        const useCase = new DeleteChatSessionUseCase(port, thread, registry);
        await useCase.execute(session.id);
        deleteThread.mockClear();
        await expect(useCase.execute(session.id)).rejects.toBeInstanceOf(ChatSessionNotFoundError);
        expect(deleteThread).toHaveBeenCalledWith(session.id);
    });
});

describe('DeleteChatSessionUseCase with an active run', () => {
    it('cancels the active run before clearing the thread and removing the session', async () => {
        const { port, thread, repo, deleteThread, registry } = setup();
        const session = await new CreateChatSessionUseCase(port).execute();
        const run = registry.tryStart(session.id, 'run-1');
        let abortedAtThreadDelete = false;
        let sessionPresentAtThreadDelete = false;
        deleteThread.mockImplementation((() => {
            abortedAtThreadDelete = run?.signal.aborted ?? false;
            sessionPresentAtThreadDelete = repo.sessions.has(session.id);
            return Promise.resolve();
        }) as () => unknown);
        await new DeleteChatSessionUseCase(port, thread, registry).execute(session.id);
        expect(abortedAtThreadDelete).toBe(true);
        expect(sessionPresentAtThreadDelete).toBe(true);
        expect(run?.status).toBe('cancelled');
        expect(repo.sessions.has(session.id)).toBe(false);
    });

    it('does not touch the run of another chat', async () => {
        const { port, thread, registry } = setup();
        const doomed = await new CreateChatSessionUseCase(port).execute();
        const other = await new CreateChatSessionUseCase(port).execute();
        const otherRun = registry.tryStart(other.id, 'run-2');
        await new DeleteChatSessionUseCase(port, thread, registry).execute(doomed.id);
        expect(otherRun?.status).toBe('running');
    });
});

describe('CancelAgentRunUseCase', () => {
    it('aborts the active run of the chat', async () => {
        const { registry } = setup();
        const run = registry.tryStart('t1', 'run-1');
        await new CancelAgentRunUseCase(registry).execute('t1');
        expect(run?.status).toBe('cancelled');
        expect(run?.signal.aborted).toBe(true);
    });

    it('does not fail when the chat has no active run', async () => {
        const { registry } = setup();
        await expect(new CancelAgentRunUseCase(registry).execute('t1')).resolves.toBeUndefined();
    });

    it('is idempotent', async () => {
        const { registry } = setup();
        registry.tryStart('t1', 'run-1');
        const useCase = new CancelAgentRunUseCase(registry);
        await useCase.execute('t1');
        await expect(useCase.execute('t1')).resolves.toBeUndefined();
    });
});
