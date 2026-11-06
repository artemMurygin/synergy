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
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CreateChatSessionUseCase } from '../../application/create-chat-session.use-case';
import { DeleteChatSessionUseCase } from '../../application/delete-chat-session.use-case';
import { GetChatMessagesUseCase } from '../../application/get-chat-messages.use-case';
import { ListChatSessionsUseCase } from '../../application/list-chat-sessions.use-case';
import { RenameChatSessionUseCase } from '../../application/rename-chat-session.use-case';
import type { ChatMessage } from '../../domain/chat-message';
import type { ChatSession } from '../../domain/chat-session';
import { ChatSessionNotFoundError } from '../../domain/chat-session-not-found.error';
import { InvalidChatTitleError } from '../../domain/chat-title';
import type { ToolCallTrace } from '../../domain/ports/sheets-assistant.port';

const createSchema = z.object({ title: z.string().optional() });
const renameSchema = z.object({ title: z.string() });
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ChatSessionResponse {
    id: string;
    title: string;
    titleIsCustom: boolean;
    createdAt: string;
    lastActivityAt: string;
}

interface ChatMessageResponse {
    id: number;
    role: string;
    text: string;
    toolCalls: readonly ToolCallTrace[] | null;
    durationMs: number | null;
    createdAt: string;
}

function toSessionResponse(session: ChatSession): ChatSessionResponse {
    return {
        id: session.id,
        title: session.title.value,
        titleIsCustom: session.titleIsCustom,
        createdAt: session.createdAt.toISOString(),
        lastActivityAt: session.lastActivityAt.toISOString(),
    };
}

function toMessageResponse(message: ChatMessage): ChatMessageResponse {
    return {
        id: message.id,
        role: message.role,
        text: message.text,
        toolCalls: message.toolCalls,
        durationMs: message.durationMs,
        createdAt: message.createdAt.toISOString(),
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

@ApiTags('chat-sessions')
@Controller('chat-sessions')
export class ChatSessionsController {
    constructor(
        private readonly createSession: CreateChatSessionUseCase,
        private readonly listSessions: ListChatSessionsUseCase,
        private readonly getMessages: GetChatMessagesUseCase,
        private readonly renameSession: RenameChatSessionUseCase,
        private readonly deleteSession: DeleteChatSessionUseCase,
    ) {}

    @Post()
    async create(@Body() body: unknown): Promise<ChatSessionResponse> {
        const parsed = createSchema.safeParse(body ?? {});
        if (!parsed.success) throw new BadRequestException('Body must be {"title"?: string}');
        try {
            return toSessionResponse(await this.createSession.execute(parsed.data.title));
        } catch (error) {
            return mapError(error);
        }
    }

    @Get()
    async list(): Promise<ChatSessionResponse[]> {
        return (await this.listSessions.execute()).map(toSessionResponse);
    }

    @Get(':id/messages')
    async messages(@Param('id') id: string): Promise<ChatMessageResponse[]> {
        assertKnownIdFormat(id);
        try {
            return (await this.getMessages.execute(id)).map(toMessageResponse);
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
}
