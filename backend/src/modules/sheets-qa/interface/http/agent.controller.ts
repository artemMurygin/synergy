import {
    BadRequestException,
    Body,
    ConflictException,
    Controller,
    HttpCode,
    HttpStatus,
    NotFoundException,
    Post,
    Res,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import {
    InvalidQuestionError,
    StartAgentRunUseCase,
} from '../../application/start-agent-run.use-case';
import { ChatSessionNotFoundError } from '../../domain/chat-session-not-found.error';
import { RunConflictError } from '../../domain/run-conflict.error';
import { ApiErrorResponse } from '../../../../shared/http/api-error.response';
import { AgUiEventMapper } from './ag-ui-event-mapper';
import { assertChatSessionIdFormat } from './chat-session-id';
import { SseRunObserver } from './sse-run-observer';

const contentPartSchema = z.object({ type: z.string(), text: z.string().optional() }).loose();
const messageSchema = z
    .object({
        role: z.string(),
        content: z.union([z.string(), z.array(contentPartSchema)]).optional(),
    })
    .loose();
const runInputSchema = z
    .object({
        threadId: z.string(),
        runId: z.string().min(1),
        messages: z.array(messageSchema),
    })
    .loose();

type InputMessage = z.infer<typeof messageSchema>;

function userMessageText(message: InputMessage): string {
    const { content } = message;
    if (typeof content === 'string') return content;
    return (content ?? [])
        .filter((part) => part.type === 'text')
        .map((part) => part.text ?? '')
        .join('');
}

function lastUserQuestion(messages: readonly InputMessage[]): string | null {
    const last = messages.findLast((message) => message.role === 'user');
    return last === undefined ? null : userMessageText(last);
}

@ApiTags('agent')
@Controller('agent')
export class AgentController {
    constructor(private readonly startRun: StartAgentRunUseCase) {}

    @Post()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Run the sheets assistant on a question and stream the events (AG-UI over SSE)',
    })
    @ApiProduces('text/event-stream')
    @ApiResponse({ status: HttpStatus.OK, description: 'SSE stream of AG-UI events' })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid body or question',
        type: ApiErrorResponse,
    })
    @ApiResponse({
        status: HttpStatus.NOT_FOUND,
        description: 'Chat session not found',
        type: ApiErrorResponse,
    })
    @ApiResponse({
        status: HttpStatus.CONFLICT,
        description: 'The chat already has an active run',
        type: ApiErrorResponse,
    })
    async run(@Body() body: unknown, @Res() res: Response): Promise<void> {
        const parsed = runInputSchema.safeParse(body);
        const question = parsed.success ? lastUserQuestion(parsed.data.messages) : null;
        if (!parsed.success || question === null) {
            throw new BadRequestException(
                'Body must be AG-UI RunAgentInput with threadId, runId and a user message',
            );
        }
        const { threadId, runId } = parsed.data;
        assertChatSessionIdFormat(threadId);

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
