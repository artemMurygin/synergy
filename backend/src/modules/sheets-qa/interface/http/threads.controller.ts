import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    NotFoundException,
    Param,
    Patch,
    Post,
} from '@nestjs/common';
import type { Message } from '@ag-ui/core';
import { ApiTags } from '@nestjs/swagger';
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
import { ThreadMessageMapper } from './thread-message-mapper';

const createSchema = z.object({ title: z.string().optional() });
const renameSchema = z.object({ title: z.string() });
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ChatSessionResponse {
    id: string;
    title: string;
    titleIsCustom: boolean;
    createdAt: string;
    lastActivityAt: string;
    /** An agent run is active in the chat right now; absent where the run state is not read. */
    running?: boolean;
}

interface ThreadHistoryResponse {
    messages: Message[];
    running: boolean;
}

function toSessionResponse(session: ChatSession, running?: boolean): ChatSessionResponse {
    return {
        id: session.id,
        title: session.title.value,
        titleIsCustom: session.titleIsCustom,
        createdAt: session.createdAt.toISOString(),
        lastActivityAt: session.lastActivityAt.toISOString(),
        ...(running === undefined ? {} : { running }),
    };
}

/** A malformed id cannot belong to any session; avoids a Postgres uuid cast error (500). */
function assertKnownIdFormat(id: string): void {
    if (!UUID_PATTERN.test(id)) throw new NotFoundException(`Chat session not found: ${id}`);
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
    async list(): Promise<ChatSessionResponse[]> {
        return (await this.listSessions.execute()).map((item) =>
            toSessionResponse(item.session, item.running),
        );
    }

    @Get(':id/messages')
    async messages(@Param('id') id: string): Promise<ThreadHistoryResponse> {
        assertKnownIdFormat(id);
        try {
            const history = await this.getMessages.execute(id);
            return {
                messages: ThreadMessageMapper.toAgUi(history.messages),
                running: history.running,
            };
        } catch (error) {
            return mapError(error);
        }
    }

    @Patch(':id')
    async rename(@Param('id') id: string, @Body() body: unknown): Promise<ChatSessionResponse> {
        const parsed = renameSchema.safeParse(body);
        if (!parsed.success) throw new BadRequestException('Body must be {"title": string}');
        assertKnownIdFormat(id);
        try {
            return toSessionResponse(await this.renameSession.execute(id, parsed.data.title));
        } catch (error) {
            return mapError(error);
        }
    }

    @Delete(':id')
    @HttpCode(204)
    async remove(@Param('id') id: string): Promise<void> {
        assertKnownIdFormat(id);
        try {
            await this.deleteSession.execute(id);
        } catch (error) {
            mapError(error);
        }
    }

    /** Idempotent: a chat without an active run (or an unknown one) is not an error. */
    @Post(':id/run/cancel')
    @HttpCode(204)
    async cancel(@Param('id') id: string): Promise<void> {
        await this.cancelRun.execute(id);
    }
}
