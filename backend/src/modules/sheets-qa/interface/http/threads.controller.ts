import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    NotFoundException,
    Param,
    Patch,
    Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CancelAgentRunUseCase } from '../../application/cancel-agent-run.use-case';
import { CreateChatSessionUseCase } from '../../application/create-chat-session.use-case';
import { DeleteChatSessionUseCase } from '../../application/delete-chat-session.use-case';
import { GetChatMessagesUseCase } from '../../application/get-chat-messages.use-case';
import { ListChatSessionsUseCase } from '../../application/list-chat-sessions.use-case';
import { RenameChatSessionUseCase } from '../../application/rename-chat-session.use-case';
import type { ChatSession } from '../../domain/chat-session';
import { ChatSessionNotFoundError } from '../../domain/chat-session-not-found.error';
import { InvalidChatTitleError } from '../../domain/chat-title';
import { ApiErrorResponse } from '../../../../shared/http/api-error.response';
import { assertChatSessionIdFormat } from './chat-session-id';
import { ChatSessionResponse } from './chat-session.response';
import { ThreadHistoryResponse } from './thread-history.response';
import { ThreadMessageMapper } from './thread-message-mapper';

const createSchema = z.object({ title: z.string().optional() });
const renameSchema = z.object({ title: z.string() });

function toSessionResponse(session: ChatSession, running?: boolean): ChatSessionResponse {
    return new ChatSessionResponse({
        id: session.id,
        title: session.title.value,
        titleIsCustom: session.titleIsCustom,
        createdAt: session.createdAt.toISOString(),
        lastActivityAt: session.lastActivityAt.toISOString(),
        running,
    });
}

function mapError(error: unknown): never {
    if (error instanceof ChatSessionNotFoundError) throw new NotFoundException(error.message);
    if (error instanceof InvalidChatTitleError) throw new BadRequestException(error.message);
    throw error;
}

@ApiTags('threads')
@Controller('threads')
export class ThreadsController {
    constructor(
        private readonly createSession: CreateChatSessionUseCase,
        private readonly listSessions: ListChatSessionsUseCase,
        private readonly getMessages: GetChatMessagesUseCase,
        private readonly renameSession: RenameChatSessionUseCase,
        private readonly deleteSession: DeleteChatSessionUseCase,
        private readonly cancelRun: CancelAgentRunUseCase,
    ) {}

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Create a chat' })
    @ApiResponse({
        status: HttpStatus.CREATED,
        description: 'Chat created',
        type: ChatSessionResponse,
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid body',
        type: ApiErrorResponse,
    })
    async create(@Body() body: unknown): Promise<ChatSessionResponse> {
        const parsed = createSchema.safeParse(body ?? {});
        if (!parsed.success) throw new BadRequestException('Body must be {"title"?: string}');
        try {
            return toSessionResponse(await this.createSession.execute(parsed.data.title), false);
        } catch (error) {
            return mapError(error);
        }
    }

    @Get()
    @ApiOperation({ summary: 'List chats' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Chats of the user',
        type: [ChatSessionResponse],
    })
    async list(): Promise<ChatSessionResponse[]> {
        return (await this.listSessions.execute()).map((item) =>
            toSessionResponse(item.session, item.running),
        );
    }

    @Get(':id/messages')
    @ApiOperation({ summary: 'Get the message history of a chat and whether a run is active' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Chat history',
        type: ThreadHistoryResponse,
    })
    @ApiResponse({
        status: HttpStatus.NOT_FOUND,
        description: 'Chat session not found',
        type: ApiErrorResponse,
    })
    async messages(@Param('id') id: string): Promise<ThreadHistoryResponse> {
        assertChatSessionIdFormat(id);
        try {
            const history = await this.getMessages.execute(id);
            return new ThreadHistoryResponse({
                messages: ThreadMessageMapper.toAgUi(history.messages),
                running: history.running,
            });
        } catch (error) {
            return mapError(error);
        }
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Rename a chat' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Renamed chat', type: ChatSessionResponse })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid body',
        type: ApiErrorResponse,
    })
    @ApiResponse({
        status: HttpStatus.NOT_FOUND,
        description: 'Chat session not found',
        type: ApiErrorResponse,
    })
    async rename(@Param('id') id: string, @Body() body: unknown): Promise<ChatSessionResponse> {
        const parsed = renameSchema.safeParse(body);
        if (!parsed.success) throw new BadRequestException('Body must be {"title": string}');
        assertChatSessionIdFormat(id);
        try {
            return toSessionResponse(await this.renameSession.execute(id, parsed.data.title));
        } catch (error) {
            return mapError(error);
        }
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete a chat and cancel its active run' })
    @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Chat deleted' })
    @ApiResponse({
        status: HttpStatus.NOT_FOUND,
        description: 'Chat session not found',
        type: ApiErrorResponse,
    })
    async remove(@Param('id') id: string): Promise<void> {
        assertChatSessionIdFormat(id);
        try {
            await this.deleteSession.execute(id);
        } catch (error) {
            mapError(error);
        }
    }

    @Post(':id/run/cancel')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Cancel the active run of a chat; a no-op without one' })
    @ApiResponse({
        status: HttpStatus.NO_CONTENT,
        description: 'Run cancelled or nothing to cancel',
    })
    async cancel(@Param('id') id: string): Promise<void> {
        await this.cancelRun.execute(id);
    }
}
