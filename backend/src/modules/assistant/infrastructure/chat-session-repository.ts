import { Inject, Injectable } from '@nestjs/common';
import { sql, type CommonQueryMethods, type DatabasePool } from 'slonik';
import { z } from 'zod';
import { PG_POOL } from '../../../database/postgres/database.constants';
import { ChatChannel } from '../domain/chat-channel';
import { ChatMessage } from '../domain/chat-message';
import { ChatRole } from '../domain/chat-role';
import { ChatSession } from '../domain/chat-session';
import { ChatSessionNotFoundError } from '../domain/chat-session-not-found.error';
import { ChatTitle } from '../domain/chat-title';
import { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';
import type { AssistantAnswer } from '../domain/ports/agent-runner.port';

const timestamp = z.union([z.number(), z.string(), z.date()]).transform((v) => new Date(v));

const sessionRow = z.object({
    id: z.string(),
    owner_id: z.string(),
    channel: z.string(),
    title: z.string(),
    title_is_custom: z.boolean(),
    created_at: timestamp,
    last_activity_at: timestamp,
});

const toolCallsSchema = z.array(z.object({ name: z.string(), args: z.unknown() }));

const messageRow = z.object({
    id: z.coerce.number(),
    session_id: z.string(),
    role: z.string(),
    text: z.string(),
    tool_calls: z.unknown(),
    duration_ms: z.number().nullable(),
    created_at: timestamp,
});

const SESSION_COLUMNS = sql.fragment`
    id, owner_id, channel, title, title_is_custom,
    (extract(epoch FROM created_at) * 1000)::float8 AS created_at,
    (extract(epoch FROM last_activity_at) * 1000)::float8 AS last_activity_at`;

const MESSAGE_COLUMNS = sql.fragment`
    id, session_id, role, text, tool_calls, duration_ms,
    (extract(epoch FROM created_at) * 1000)::float8 AS created_at`;

function toSession(raw: unknown): ChatSession {
    const row = sessionRow.parse(raw);
    return ChatSession.restore({
        id: row.id,
        ownerId: row.owner_id,
        channel: ChatChannel.parse(row.channel),
        title: ChatTitle.of(row.title),
        titleIsCustom: row.title_is_custom,
        createdAt: row.created_at,
        lastActivityAt: row.last_activity_at,
    });
}

function toMessage(raw: unknown): ChatMessage {
    const row = messageRow.parse(raw);
    return ChatMessage.restore({
        id: row.id,
        sessionId: row.session_id,
        role: ChatRole.parse(row.role),
        text: row.text,
        toolCalls: row.tool_calls === null ? null : toolCallsSchema.parse(row.tool_calls),
        durationMs: row.duration_ms,
        createdAt: row.created_at,
    });
}

@Injectable()
export class ChatSessionRepository extends ChatSessionRepositoryPort {
    constructor(@Inject(PG_POOL) private readonly pool: DatabasePool) {
        super();
    }

    async create(session: ChatSession): Promise<ChatSession> {
        const row = await this.pool.one(sql.unsafe`
            INSERT INTO chat_session
                (id, owner_id, channel, title, title_is_custom, created_at, last_activity_at)
            VALUES (${session.id}, ${session.ownerId}, ${session.channel}, ${session.title.value}, ${session.titleIsCustom},
                    ${session.createdAt.toISOString()}, ${session.lastActivityAt.toISOString()})
            RETURNING ${SESSION_COLUMNS}
        `);
        return toSession(row);
    }

    async findById(id: string): Promise<ChatSession | null> {
        const row = await this.pool.maybeOne(sql.unsafe`
            SELECT ${SESSION_COLUMNS} FROM chat_session WHERE id = ${id}
        `);
        return row === null ? null : toSession(row);
    }

    async findOwned(id: string, ownerId: string): Promise<ChatSession | null> {
        const row = await this.pool.maybeOne(sql.unsafe`
            SELECT ${SESSION_COLUMNS} FROM chat_session
            WHERE id = ${id} AND owner_id = ${ownerId}
        `);
        return row === null ? null : toSession(row);
    }

    async list(ownerId: string): Promise<ChatSession[]> {
        const rows = await this.pool.any(sql.unsafe`
            SELECT ${SESSION_COLUMNS} FROM chat_session
            WHERE owner_id = ${ownerId} AND channel = 'app'
            ORDER BY last_activity_at DESC, id
        `);
        return rows.map(toSession);
    }

    async findOrCreateTelegram(ownerId: string): Promise<ChatSession> {
        const fresh = ChatSession.create({ ownerId, channel: 'telegram' });
        // The partial unique index makes concurrent first messages converge on one row.
        await this.pool.query(sql.unsafe`
            INSERT INTO chat_session
                (id, owner_id, channel, title, title_is_custom, created_at, last_activity_at)
            VALUES (${fresh.id}, ${ownerId}, 'telegram', ${fresh.title.value}, false,
                    ${fresh.createdAt.toISOString()}, ${fresh.lastActivityAt.toISOString()})
            ON CONFLICT (owner_id) WHERE channel = 'telegram' DO NOTHING
        `);
        const row = await this.pool.one(sql.unsafe`
            SELECT ${SESSION_COLUMNS} FROM chat_session
            WHERE owner_id = ${ownerId} AND channel = 'telegram'
        `);
        return toSession(row);
    }

    async findTelegram(ownerId: string): Promise<ChatSession | null> {
        const row = await this.pool.maybeOne(sql.unsafe`
            SELECT ${SESSION_COLUMNS} FROM chat_session
            WHERE owner_id = ${ownerId} AND channel = 'telegram'
        `);
        return row === null ? null : toSession(row);
    }

    async listMessages(sessionId: string, ownerId: string): Promise<ChatMessage[]> {
        await this.requireOwned(this.pool, sessionId, ownerId);
        const rows = await this.pool.any(sql.unsafe`
            SELECT ${MESSAGE_COLUMNS} FROM chat_message WHERE session_id = ${sessionId} ORDER BY id
        `);
        return rows.map(toMessage);
    }

    async appendUserMessage(
        sessionId: string,
        ownerId: string,
        text: string,
    ): Promise<ChatMessage> {
        const row = await this.pool.maybeOne(sql.unsafe`
            INSERT INTO chat_message (session_id, role, text)
            SELECT id, 'user', ${text} FROM chat_session
            WHERE id = ${sessionId} AND owner_id = ${ownerId}
            RETURNING ${MESSAGE_COLUMNS}
        `);
        if (row === null) throw new ChatSessionNotFoundError(sessionId);
        return toMessage(row);
    }

    async appendAgentAnswer(
        sessionId: string,
        ownerId: string,
        answer: AssistantAnswer,
        autoTitle?: ChatTitle,
    ): Promise<ChatMessage> {
        return this.pool.transaction(async (tx) => {
            const touched = await tx.maybeOne(sql.unsafe`
                UPDATE chat_session
                SET last_activity_at = now(),
                    title = CASE WHEN title_is_custom OR ${autoTitle === undefined}
                                 THEN title ELSE ${autoTitle?.value ?? ''} END
                WHERE id = ${sessionId} AND owner_id = ${ownerId}
                RETURNING id
            `);
            if (touched === null) throw new ChatSessionNotFoundError(sessionId);
            const row = await tx.one(sql.unsafe`
                INSERT INTO chat_message (session_id, role, text, tool_calls, duration_ms)
                VALUES (${sessionId}, 'agent', ${answer.answer},
                        ${JSON.stringify(answer.toolCalls)}::jsonb, ${Math.round(answer.durationMs)})
                RETURNING ${MESSAGE_COLUMNS}
            `);
            return toMessage(row);
        });
    }

    async rename(sessionId: string, ownerId: string, title: ChatTitle): Promise<ChatSession> {
        const row = await this.pool.maybeOne(sql.unsafe`
            UPDATE chat_session SET title = ${title.value}, title_is_custom = true
            WHERE id = ${sessionId} AND owner_id = ${ownerId}
            RETURNING ${SESSION_COLUMNS}
        `);
        if (row === null) throw new ChatSessionNotFoundError(sessionId);
        return toSession(row);
    }

    async delete(sessionId: string, ownerId: string): Promise<void> {
        const result = await this.pool.query(sql.unsafe`
            DELETE FROM chat_session WHERE id = ${sessionId} AND owner_id = ${ownerId}
        `);
        if (result.rowCount === 0) throw new ChatSessionNotFoundError(sessionId);
    }

    private async requireOwned(
        db: CommonQueryMethods,
        sessionId: string,
        ownerId: string,
    ): Promise<void> {
        const exists = await db.maybeOne(sql.unsafe`
            SELECT 1 AS ok FROM chat_session WHERE id = ${sessionId} AND owner_id = ${ownerId}
        `);
        if (exists === null) throw new ChatSessionNotFoundError(sessionId);
    }
}
