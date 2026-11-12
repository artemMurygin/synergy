import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import type { SystemMessageCommand } from '../../contracts/system-message.command';
import { SYSTEM_MESSAGE_JOB_NAME } from './system-message-queue.constants';
import { SystemMessageQueue } from './system-message.queue';

const command: SystemMessageCommand = {
    sessionId: '2cdc8ab1-6d50-49cc-ba14-54e4ac7ec231',
    ownerId: 'owner-1',
    text: 'Готово',
    attachments: ['doc-1'],
    dedupKey: 'event-42',
    topic: 'meeting-transcript.failed',
    subject: { fileId: 'rec-1', fileName: 'встреча.m4a' },
};

describe('SystemMessageQueue', () => {
    it('enqueues the command with the dedup key as the job id', async () => {
        const add = vi.fn().mockResolvedValue(undefined);
        await new SystemMessageQueue({ add } as unknown as Queue).request(command);
        expect(add).toHaveBeenCalledWith(SYSTEM_MESSAGE_JOB_NAME, command, { jobId: 'event-42' });
    });

    it('rejects an invalid command before enqueueing', async () => {
        const add = vi.fn();
        await expect(
            new SystemMessageQueue({ add } as unknown as Queue).request({
                ...command,
                dedupKey: '',
            }),
        ).rejects.toThrow();
        expect(add).not.toHaveBeenCalled();
    });
});
