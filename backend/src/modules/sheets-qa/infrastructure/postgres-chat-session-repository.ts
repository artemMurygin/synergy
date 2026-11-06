import { Inject, Injectable } from '@nestjs/common';
import { sql, type CommonQueryMethods, type DatabasePool } from 'slonik';
import { z } from 'zod';
import { PG_POOL } from '../../../database/postgres/database.constants';
import { ChatMessage } from '../domain/chat-message';
import { ChatRole } from '../domain/chat-role';
import { ChatSession } from '../domain/chat-session';
import { ChatSessionNotFoundError } from '../domain/chat-session-not-found.error';
import { ChatTitle } from '../domain/chat-title';
import { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';
import type { AssistantAnswer } from '../domain/ports/sheets-assistant.port';

const timestamp = z.union([z.number(), z.string(), z.date()]).transform((v) => new Date(v));

const sessionRow = z.object({
    id: z.string(),
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
    id, title, title_is_custom,
    (extract(epoch FROM created_at) * 1000)::float8 AS created_at,
    (extract(epoch FROM last_activity_at) * 1000)::float8 AS last_activity_at`;

const MESSAGE_COLUMNS = sql.fragment`
    id, session_id, role, text, tool_calls, duration_ms,
    (extract(epoch FROM created_at) * 1000)::float8 AS created_at`;

function toSession(raw: unknown): ChatSession {
    const row = sessionRow.parse(raw);
    return ChatSession.restore({
        id: row.id,
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

function isForeignKeyViolation(error: unknown): boolean {
    const cause = (error as { cause?: { code?: string } } | null)?.cause;
    return cause?.code === '23503' || (error as { code?: string } | null)?.code === '23503';
}

@Injectable()
export class PostgresChatSessionRepository extends ChatSessionRepositoryPort {
    constructor(@Inject(PG_POOL) private readonly pool: DatabasePool) {
        super();
    }

    async create(session: ChatSession): Promise<ChatSession> {
        const row = await this.pool.one(sql.unsafe`
            INSERT INTO chat_session (id, title, title_is_custom, created_at, last_activity_at)
            VALUES (${session.id}, ${session.title.value}, ${session.titleIsCustom},
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

    async list(): Promise<ChatSession[]> {
        const rows = await this.pool.any(sql.unsafe`
            SELECT ${SESSION_COLUMNS} FROM chat_session ORDER BY last_activity_at DESC, id
        `);
        return rows.map(toSession);
    }

    async listMessages(sessionId: string): Promise<ChatMessage[]> {
        await this.requireSession(this.pool, sessionId);
        const rows = await this.pool.any(sql.unsafe`
            SELECT ${MESSAGE_COLUMNS} FROM chat_message WHERE session_id = ${sessionId} ORDER BY id
        `);
        return rows.map(toMessage);
    }

    async appendUserMessage(sessionId: string, text: string): Promise<ChatMessage> {
        try {
            const row = await this.pool.one(sql.unsafe`
                INSERT INTO chat_message (session_id, role, text)
                VALUES (${sessionId}, 'user', ${text})
                RETURNING ${MESSAGE_COLUMNS}
            `);
            return toMessage(row);
        } catch (error) {
            if (isForeignKeyViolation(error)) throw new ChatSessionNotFoundError(sessionId);
            throw error;
        }
    }

    async appendAgentAnswer(
        sessionId: string,
        answer: AssistantAnswer,
        autoTitle?: ChatTitle,
    ): Promise<ChatMessage> {
        try {
            return await this.pool.transaction(async (tx) => {
                const row = await tx.one(sql.unsafe`
                    INSERT INTO chat_message (session_id, role, text, tool_calls, duration_ms)
                    VALUES (${sessionId}, 'agent', ${answer.answer},
                            ${sql.jsonb(answer.toolCalls as never)}, ${Math.round(answer.durationMs)})
                    RETURNING ${MESSAGE_COLUMNS}
                `);
                await tx.query(sql.unsafe`
                    UPDATE chat_session
                    SET last_activity_at = now(),
                        title = CASE WHEN title_is_custom OR ${autoTitle === undefined}
                                     THEN title ELSE ${autoTitle?.value ?? ''} END
                    WHERE id = ${sessionId}
                `);
                return toMessage(row);
            });
        } catch (error) {
            if (isForeignKeyViolation(error)) throw new ChatSessionNotFoundError(sessionId);
            throw error;
        }
    }

    async rename(sessionId: string, title: ChatTitle): Promise<ChatSession> {
        const row = await this.pool.maybeOne(sql.unsafe`
            UPDATE chat_session SET title = ${title.value}, title_is_custom = true
            WHERE id = ${sessionId}
            RETURNING ${SESSION_COLUMNS}
        `);
        if (row === null) throw new ChatSessionNotFoundError(sessionId);
        return toSession(row);
    }

    async delete(sessionId: string): Promise<void> {
        const result = await this.pool.query(sql.unsafe`
            DELETE FROM chat_session WHERE id = ${sessionId}
        `);
        if (result.rowCount === 0) throw new ChatSessionNotFoundError(sessionId);
    }

    private async requireSession(db: CommonQueryMethods, sessionId: string): Promise<void> {
        const exists = await db.maybeOne(sql.unsafe`
            SELECT 1 AS ok FROM chat_session WHERE id = ${sessionId}
        `);
        if (exists === null) throw new ChatSessionNotFoundError(sessionId);
    }
}
