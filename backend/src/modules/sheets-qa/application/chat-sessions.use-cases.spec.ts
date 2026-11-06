import { describe, expect, it, vi } from 'vitest';
import { type ChatMessage } from '../domain/chat-message';
import { type ChatSession } from '../domain/chat-session';
import { ChatSessionNotFoundError } from '../domain/chat-session-not-found.error';
import { type ChatTitle, InvalidChatTitleError } from '../domain/chat-title';
import type { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';
import type { ChatThreadPort } from '../domain/ports/chat-thread.port';
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
} {
    const repo = new FakeRepository();
    const deleteThread = vi.fn().mockResolvedValue(undefined);
    return {
        repo,
        deleteThread,
        port: repo as unknown as ChatSessionRepositoryPort,
        thread: { deleteThread },
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
        const { port } = setup();
        const created = await new CreateChatSessionUseCase(port).execute();
        await expect(new ListChatSessionsUseCase(port).execute()).resolves.toEqual([created]);
    });
});

describe('GetChatMessagesUseCase', () => {
    it('returns the history of a session', async () => {
        const { port } = setup();
        const session = await new CreateChatSessionUseCase(port).execute();
        await expect(new GetChatMessagesUseCase(port).execute(session.id)).resolves.toEqual([]);
    });

    it('fails with not found for an unknown session', async () => {
        const { port } = setup();
        await expect(new GetChatMessagesUseCase(port).execute('nope')).rejects.toBeInstanceOf(
            ChatSessionNotFoundError,
        );
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
        const { port, thread, repo, deleteThread } = setup();
        const session = await new CreateChatSessionUseCase(port).execute();
        await new DeleteChatSessionUseCase(port, thread).execute(session.id);
        expect(repo.sessions.has(session.id)).toBe(false);
        expect(deleteThread).toHaveBeenCalledWith(session.id);
    });

    it('clears the thread before removing the session', async () => {
        const { port, thread, repo, deleteThread } = setup();
        const session = await new CreateChatSessionUseCase(port).execute();
        let sessionPresentAtThreadDelete = false;
        const record = (): Promise<void> => {
            sessionPresentAtThreadDelete = repo.sessions.has(session.id);
            return Promise.resolve();
        };
        deleteThread.mockImplementation(record as () => unknown);
        await new DeleteChatSessionUseCase(port, thread).execute(session.id);
        expect(sessionPresentAtThreadDelete).toBe(true);
    });

    it('keeps the session when clearing the thread fails, so delete can be retried', async () => {
        const { port, thread, repo, deleteThread } = setup();
        const session = await new CreateChatSessionUseCase(port).execute();
        deleteThread.mockRejectedValueOnce(new Error('connection lost'));
        const useCase = new DeleteChatSessionUseCase(port, thread);
        await expect(useCase.execute(session.id)).rejects.toThrow('connection lost');
        expect(repo.sessions.has(session.id)).toBe(true);
        await useCase.execute(session.id);
        expect(repo.sessions.has(session.id)).toBe(false);
    });

    it('still clears the thread on a repeated delete, which fails with not found', async () => {
        const { port, thread, deleteThread } = setup();
        const session = await new CreateChatSessionUseCase(port).execute();
        const useCase = new DeleteChatSessionUseCase(port, thread);
        await useCase.execute(session.id);
        deleteThread.mockClear();
        await expect(useCase.execute(session.id)).rejects.toBeInstanceOf(ChatSessionNotFoundError);
        expect(deleteThread).toHaveBeenCalledWith(session.id);
    });
});
