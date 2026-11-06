import {
    BadRequestException,
    Body,
    ConflictException,
    Controller,
    NotFoundException,
    Post,
    Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EventEncoder } from '@ag-ui/encoder';
import type { Response } from 'express';
import { z } from 'zod';
import {
    InvalidQuestionError,
    StartAgentRunUseCase,
    type RunObserver,
} from '../../application/start-agent-run.use-case';
import type { AgentEvent } from '../../domain/agent-event';
import { ChatSessionNotFoundError } from '../../domain/chat-session-not-found.error';
import { RunConflictError } from '../../domain/run-conflict.error';
import { AgUiEventMapper } from './ag-ui-event-mapper';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const contentPartSchema = z.object({ type: z.string(), text: z.string().optional() }).loose();
const messageSchema = z
    .object({
        role: z.string(),
        content: z.union([z.string(), z.array(contentPartSchema)]).optional(),
    })
    .loose();
/** The subset of AG-UI `RunAgentInput` the server uses; the history is taken from the checkpoint. */
const runInputSchema = z
    .object({
        threadId: z.string(),
        runId: z.string().min(1),
        messages: z.array(messageSchema),
    })
    .loose();

type InputMessage = z.infer<typeof messageSchema>;

function textOf(message: InputMessage): string {
    const { content } = message;
    if (typeof content === 'string') return content;
    return (content ?? [])
        .filter((part) => part.type === 'text')
        .map((part) => part.text ?? '')
        .join('');
}

/** Only the newest user message is a new question; earlier messages are already in the thread. */
function lastUserQuestion(messages: readonly InputMessage[]): string | null {
    const last = messages.findLast((message) => message.role === 'user');
    return last === undefined ? null : textOf(last);
}

/**
 * SSE side of a run: owns the response. When the client goes away it simply stops writing,
 * the run itself goes on.
 */
class SseRunObserver implements RunObserver {
    private readonly encoder = new EventEncoder();
    private headersSent = false;
    private detached = false;

    constructor(
        private readonly res: Response,
        private readonly mapper: AgUiEventMapper,
    ) {
        res.on('close', () => {
            this.detached = true;
        });
    }

    /** Starts the stream; idempotent. Called once the run is accepted. */
    open(): void {
        if (this.headersSent || this.detached) return;
        this.headersSent = true;
        this.res.status(200).set({
            'Content-Type': this.encoder.getContentType(),
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        this.res.flushHeaders();
    }

    next(event: AgentEvent): void {
        this.open();
        if (this.detached) return;
        for (const agUiEvent of this.mapper.map(event)) {
            this.res.write(this.encoder.encodeSSE(agUiEvent));
        }
    }

    close(): void {
        if (this.detached || this.res.writableEnded) return;
        this.res.end();
    }
}

@ApiTags('agent')
@Controller('agent')
export class AgentController {
    constructor(private readonly startRun: StartAgentRunUseCase) {}

    @Post()
    async run(@Body() body: unknown, @Res() res: Response): Promise<void> {
        const parsed = runInputSchema.safeParse(body);
        const question = parsed.success ? lastUserQuestion(parsed.data.messages) : null;
        if (!parsed.success || question === null) {
            throw new BadRequestException(
                'Body must be AG-UI RunAgentInput with threadId, runId and a user message',
            );
        }
        const { threadId, runId } = parsed.data;
        // A malformed id cannot belong to any chat; avoids a Postgres uuid cast error (500).
        if (!UUID_PATTERN.test(threadId.trim())) {
            throw new NotFoundException(`Chat session not found: ${threadId}`);
        }

        const observer = new SseRunObserver(res, new AgUiEventMapper({ threadId, runId }));
        try {
            await this.startRun.execute({ threadId, runId, question }, observer);
        } catch (error) {
            if (error instanceof InvalidQuestionError) throw new BadRequestException(error.message);
            if (error instanceof ChatSessionNotFoundError) {
                throw new NotFoundException(error.message);
            }
            if (error instanceof RunConflictError) throw new ConflictException(error.message);
            throw error;
        }
        observer.open();
    }
}
