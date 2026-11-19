import { describe, expect, it, type MockInstance, vi } from 'vitest';
import { ChatSession } from '../domain/chat-session';
import { ChatSessionNotFoundError } from '../domain/chat-session-not-found.error';
import { ActiveRunRegistry } from '../infrastructure/active-run-registry';
import { InMemoryChatSessionRepository } from '../interface/http/testing/in-memory-chat-session-repository';
import { ResetTelegramDialogUseCase } from './reset-telegram-dialog.use-case';

const OWNER = 'user-1';
const OTHER = 'user-2';

function setup(): {
    repo: InMemoryChatSessionRepository;
    registry: ActiveRunRegistry;
    deleteThread: ReturnType<typeof vi.fn>;
    calls: string[];
    remove: MockInstance<InMemoryChatSessionRepository['delete']>;
    useCase: ResetTelegramDialogUseCase;
} {
    const calls: string[] = [];
    const repo = new InMemoryChatSessionRepository();
    const registry = new ActiveRunRegistry();
    const deleteThread = vi.fn((id: string) => {
        calls.push(`deleteThread:${id}`);
        return Promise.resolve();
    });
    const cancel = registry.cancel.bind(registry);
    vi.spyOn(registry, 'cancel').mockImplementation((id: string) => {
        calls.push(`cancel:${id}`);
        cancel(id);
    });
    const remove = repo.delete.bind(repo);
    const removeSpy = vi.spyOn(repo, 'delete').mockImplementation((id: string, ownerId: string) => {
        calls.push(`delete:${id}`);
        return remove(id, ownerId);
    });
    const useCase = new ResetTelegramDialogUseCase(
        repo,
        { deleteThread, latestCheckpointId: () => Promise.resolve(null) },
        registry,
    );
    return { repo, registry, deleteThread, calls, remove: removeSpy, useCase };
}

describe('InMemoryChatSessionRepository.findTelegram', () => {
    it('returns null without a dialog and does not create one', async () => {
        const repo = new InMemoryChatSessionRepository();
        await repo.create(ChatSession.create({ ownerId: OWNER, channel: 'app' }));
        expect(await repo.findTelegram(OWNER)).toBeNull();
        expect(repo.sessions.size).toBe(1);
    });

    it('returns the telegram dialog of the owner only', async () => {
        const repo = new InMemoryChatSessionRepository();
        const dialog = await repo.findOrCreateTelegram(OWNER);
        expect((await repo.findTelegram(OWNER))?.id).toBe(dialog.id);
        expect(await repo.findTelegram(OTHER)).toBeNull();
    });
});

describe('ResetTelegramDialogUseCase', () => {
    it('cancels the run, clears the thread and deletes the dialog in this order', async () => {
        const { repo, registry, calls, useCase } = setup();
        const dialog = await repo.findOrCreateTelegram(OWNER);
        await repo.appendUserMessage(dialog.id, OWNER, 'задача для Пети');
        const run = registry.tryStart(dialog.id, 'run-1');

        await useCase.execute(OWNER);

        expect(calls).toEqual([
            `cancel:${dialog.id}`,
            `deleteThread:${dialog.id}`,
            `delete:${dialog.id}`,
        ]);
        expect(run?.signal.aborted).toBe(true);
        expect(await repo.findTelegram(OWNER)).toBeNull();
        expect(repo.messages.has(dialog.id)).toBe(false);
    });

    it('does nothing when the owner has no dialog', async () => {
        const { repo, calls, deleteThread, useCase } = setup();
        await repo.create(ChatSession.create({ ownerId: OWNER, channel: 'app' }));

        await expect(useCase.execute(OWNER)).resolves.toBeUndefined();

        expect(calls).toEqual([]);
        expect(deleteThread).not.toHaveBeenCalled();
        expect(repo.sessions.size).toBe(1);
    });

    it('after the reset findOrCreateTelegram starts a new dialog with another id', async () => {
        const { repo, useCase } = setup();
        const before = await repo.findOrCreateTelegram(OWNER);

        await useCase.execute(OWNER);

        const after = await repo.findOrCreateTelegram(OWNER);
        expect(after.id).not.toBe(before.id);
        expect(await repo.listMessages(after.id, OWNER)).toEqual([]);
    });

    it('leaves dialogs of other owners and app chats untouched', async () => {
        const { repo, registry, useCase } = setup();
        await repo.findOrCreateTelegram(OWNER);
        const foreign = await repo.findOrCreateTelegram(OTHER);
        const app = await repo.create(ChatSession.create({ ownerId: OWNER, channel: 'app' }));
        const foreignRun = registry.tryStart(foreign.id, 'run-2');

        await useCase.execute(OWNER);

        expect((await repo.findTelegram(OTHER))?.id).toBe(foreign.id);
        expect(await repo.findOwned(app.id, OWNER)).not.toBeNull();
        expect(foreignRun?.signal.aborted).toBe(false);
    });

    it('stays idempotent when a concurrent reset already deleted the dialog', async () => {
        const { repo, remove, useCase } = setup();
        const dialog = await repo.findOrCreateTelegram(OWNER);
        remove.mockRejectedValueOnce(new ChatSessionNotFoundError(dialog.id));

        await expect(useCase.execute(OWNER)).resolves.toBeUndefined();
    });
});
