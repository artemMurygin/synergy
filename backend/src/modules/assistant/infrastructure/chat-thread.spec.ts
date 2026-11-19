import { emptyCheckpoint, MemorySaver, type Checkpoint } from '@langchain/langgraph';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ChatThread } from './chat-thread';

function checkpoint(id: string): Checkpoint {
    return { ...emptyCheckpoint(), id };
}

describe('ChatThread.latestCheckpointId', () => {
    it('is null for a chat without an agent context', async () => {
        const thread = new ChatThread(new MemorySaver());
        await expect(thread.latestCheckpointId(randomUUID())).resolves.toBeNull();
    });

    it('is the id of the last checkpoint of the main graph', async () => {
        const saver = new MemorySaver();
        const threadId = randomUUID();
        const first = await saver.put(
            { configurable: { thread_id: threadId, checkpoint_ns: '' } },
            checkpoint('1f000000-0000-6000-8000-000000000001'),
            { source: 'loop', step: 0, parents: {} },
        );
        await saver.put(first, checkpoint('1f000000-0000-6000-8000-000000000002'), {
            source: 'loop',
            step: 1,
            parents: {},
        });
        await expect(new ChatThread(saver).latestCheckpointId(threadId)).resolves.toBe(
            '1f000000-0000-6000-8000-000000000002',
        );
    });

    it('ignores checkpoints of subgraphs (checkpoint_ns is not empty)', async () => {
        const saver = new MemorySaver();
        const threadId = randomUUID();
        await saver.put(
            { configurable: { thread_id: threadId, checkpoint_ns: '' } },
            checkpoint('1f000000-0000-6000-8000-000000000001'),
            { source: 'loop', step: 0, parents: {} },
        );
        await saver.put(
            { configurable: { thread_id: threadId, checkpoint_ns: 'tasks:sub' } },
            checkpoint('1f000000-0000-6000-8000-000000000009'),
            { source: 'loop', step: 0, parents: {} },
        );
        await expect(new ChatThread(saver).latestCheckpointId(threadId)).resolves.toBe(
            '1f000000-0000-6000-8000-000000000001',
        );
    });

    it('reads the main graph namespace explicitly', async () => {
        const getTuple = vi.fn().mockResolvedValue(undefined);
        await new ChatThread({ getTuple, deleteThread: vi.fn() }).latestCheckpointId('t1');
        expect(getTuple).toHaveBeenCalledWith({
            configurable: { thread_id: 't1', checkpoint_ns: '' },
        });
    });
});
