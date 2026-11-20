import {
    BadRequestException,
    Body,
    ConflictException,
    Controller,
    GoneException,
    HttpCode,
    HttpStatus,
    NotFoundException,
    Post,
    Req,
    Res,
    UnprocessableEntityException,
    UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
    InvalidQuestionError,
    StartAgentRunUseCase,
} from '../../application/start-agent-run.use-case';
import {
    ChatAttachmentExpiredError,
    ChatAttachmentNotFoundError,
} from '../../domain/chat-attachment.errors';
import { ChatSessionNotFoundError } from '../../domain/chat-session-not-found.error';
import { MessageNotFoundError } from '../../domain/message-not-found.error';
import { MessageNotRewindableError } from '../../domain/message-not-rewindable.error';
import { RunConflictError } from '../../domain/run-conflict.error';
import { CurrentUser, type AuthenticatedUser } from '../../../auth/interface/http/decorators';
import { ApiErrorResponse } from '../../../../shared/http/api-error.response';
import { AgUiEventMapper } from './ag-ui-event-mapper';
import { ClientAppGuard } from '../../../../shared/http/client-app.guard';
import { ClientResolver } from '../../../../shared/http/client-resolver';
import { assertChatSessionIdFormat } from './chat-session-id';
import { ownerOf } from './owner-of';
import { SseRunObserver } from './sse-run-observer';

const contentPartSchema = z.object({ type: z.string(), text: z.string().optional() }).loose();
const messageSchema = z
    .object({
        role: z.string(),
        content: z.union([z.string(), z.array(contentPartSchema)]).optional(),
    })
    .loose();
const forwardedPropsSchema = z
    .object({
        fileIds: z.array(z.uuid()).optional(),
        replaceFromMessageId: z.string().min(1).optional(),
    })
    .loose()
    .optional();
const runInputSchema = z
    .object({
        threadId: z.string(),
        runId: z.string().min(1),
        messages: z.array(messageSchema),
        forwardedProps: forwardedPropsSchema,
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
@UseGuards(ClientAppGuard)
@Controller('agent')
export class AgentController {
    private readonly clients = new ClientResolver();

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
        description: 'Chat session or an attached file not found',
        type: ApiErrorResponse,
    })
    @ApiResponse({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description:
            'forwardedProps.replaceFromMessageId names a question that cannot be edited (code MESSAGE_NOT_EDITABLE)',
        type: ApiErrorResponse,
    })
    @ApiResponse({
        status: HttpStatus.GONE,
        description: 'An attached file is deleted: its retention period is over',
        type: ApiErrorResponse,
    })
    @ApiResponse({
        status: HttpStatus.CONFLICT,
        description: 'The chat already has an active run',
        type: ApiErrorResponse,
    })
    async run(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Body() body: unknown,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<void> {
        const ownerId = ownerOf(user);
        const client = this.clients.resolve(req);
        const parsed = runInputSchema.safeParse(body);
        const fileIds = parsed.success ? (parsed.data.forwardedProps?.fileIds ?? []) : [];
        const lastQuestion = parsed.success ? lastUserQuestion(parsed.data.messages) : null;
        // A message of only files may come without a user message text.
        const question = lastQuestion ?? (fileIds.length > 0 ? '' : null);
        if (!parsed.success || question === null) {
            throw new BadRequestException(
                'Body must be AG-UI RunAgentInput with threadId, runId and a user message ' +
                    'or forwardedProps.fileIds',
            );
        }
        const { threadId, runId } = parsed.data;
        const replaceFromMessageId = parsed.data.forwardedProps?.replaceFromMessageId;
        assertChatSessionIdFormat(threadId);

        const observer = new SseRunObserver(res, new AgUiEventMapper({ threadId, runId }));
        try {
            await this.startRun.execute(
                ownerId,
                {
                    threadId,
                    runId,
                    question,
                    fileIds,
                    ...(replaceFromMessageId === undefined ? {} : { replaceFromMessageId }),
                },
                observer,
                client,
            );
        } catch (error) {
            if (error instanceof InvalidQuestionError) throw new BadRequestException(error.message);
            if (
                error instanceof ChatSessionNotFoundError ||
                error instanceof MessageNotFoundError
            ) {
                throw new NotFoundException(error.message);
            }
            if (error instanceof MessageNotRewindableError) {
                throw new UnprocessableEntityException({
                    message: 'Это сообщение нельзя изменить',
                    code: 'MESSAGE_NOT_EDITABLE',
                });
            }
            if (error instanceof ChatAttachmentNotFoundError) {
                throw new NotFoundException({
                    message: error.message,
                    code: 'FILE_NOT_FOUND',
                    fileId: error.fileId,
                });
            }
            if (error instanceof ChatAttachmentExpiredError) {
                throw new GoneException({
                    message: 'Срок хранения файла истёк',
                    code: 'FILE_GONE',
                    fileId: error.fileId,
                });
            }
            if (error instanceof RunConflictError) throw new ConflictException(error.message);
            throw error;
        }
        observer.open();
    }
}
