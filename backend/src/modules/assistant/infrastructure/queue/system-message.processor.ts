import { ConfigService } from '@nestjs/config';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { UnrecoverableError, type Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../../../shared/config/env.schema';
import { PostSystemMessageUseCase } from '../../application/post-system-message.use-case';
import { systemMessageCommandSchema } from '../../contracts/system-message.command';
import { RunInProgressError } from '../../domain/run-in-progress.error';
import { SYSTEM_MESSAGE_QUEUE_NAME } from './system-message-queue.constants';

export type SystemMessageJob = Pick<Job, 'id' | 'data' | 'timestamp'>;

@Processor(SYSTEM_MESSAGE_QUEUE_NAME)
export class SystemMessageProcessor extends WorkerHost {
    constructor(
        private readonly postSystemMessage: PostSystemMessageUseCase,
        private readonly config: ConfigService<Env, true>,
        private readonly logger: PinoLogger,
    ) {
        super();
        this.logger.setContext(SystemMessageProcessor.name);
    }

    async process(job: SystemMessageJob): Promise<void> {
        const parsed = systemMessageCommandSchema.safeParse(job.data);
        if (!parsed.success) {
            this.logger.error({ jobId: job.id }, 'System message job payload is invalid');
            throw new UnrecoverableError('Invalid system message job payload');
        }
        const command = parsed.data;
        try {
            const outcome = await this.postSystemMessage.execute(command);
            this.logger.info(
                { jobId: job.id, sessionId: command.sessionId, topic: command.topic, outcome },
                'System message processed',
            );
        } catch (error: unknown) {
            if (!(error instanceof RunInProgressError)) throw error;
            const deadlineMs = this.config.get('CHAT_SYSTEM_MESSAGE_DEADLINE_MS', { infer: true });
            // Throwing lets BullMQ retry after the fixed delay; past the deadline the message is dropped.
            if (Date.now() - job.timestamp < deadlineMs) throw error;
            this.logger.warn(
                { jobId: job.id, sessionId: command.sessionId, topic: command.topic },
                'System message dropped: the chat stayed busy until the deadline',
            );
            throw new UnrecoverableError('The chat stayed busy until the deadline');
        }
    }
}
