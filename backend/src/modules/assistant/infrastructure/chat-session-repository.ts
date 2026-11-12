import { Injectable } from '@nestjs/common';
import { sql, type CommonQueryMethods } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { ATTACHMENT_KINDS } from '../../../shared/agent-capability';
import { ChatChannel } from '../domain/chat-channel';
import { ChatMessage } from '../domain/chat-message';
import { ChatRole } from '../domain/chat-role';
import { ChatSession } from '../domain/chat-session';
import { ChatSessionNotFoundError } from '../domain/chat-session-not-found.error';
import { ChatTitle } from '../domain/chat-title';
import { ATTACHMENT_FILE_STATUSES, MessageAttachment } from '../domain/message-attachment';
import { MESSAGE_SOURCES } from '../domain/message-source';
import {
    ChatSessionRepositoryPort,
    type SystemMessageInput,
} from '../domain/ports/chat-session-repository.port';
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
    source: z.enum(MESSAGE_SOURCES),
    dedup_key: z.string().nullable(),
    created_at: timestamp,
});

const attachmentRow = z.object({
    message_id: z.coerce.number(),
    file_id: z.string(),
    position: z.number(),
    name: z.string(),
    media_type: z.string(),
    kind: z.enum(ATTACHMENT_KINDS),
    size_bytes: z.number(),
    status: z.enum(ATTACHMENT_FILE_STATUSES),
});

const SESSION_COLUMNS = sql.fragment`
    id, owner_id, channel, title, title_is_custom,
    (extract(epoch FROM created_at) * 1000)::float8 AS created_at,
    (extract(epoch FROM last_activity_at) * 1000)::float8 AS last_activity_at`;

const MESSAGE_COLUMNS = sql.fragment`
    id, session_id, role, text, tool_calls, duration_ms, source, dedup_key,
    (extract(epoch FROM created_at) * 1000)::float8 AS created_at`;

// The file status is never copied into the history: it is read from stored_file.
const ATTACHMENT_COLUMNS = sql.fragment`
    a.message_id, a.file_id, a.position::int AS position, f.original_name AS name,
    f.media_type, f.kind, f.size_bytes::float8 AS size_bytes, f.status`;

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

function toAttachment(raw: unknown): { messageId: number; attachment: MessageAttachment } {
    const row = attachmentRow.parse(raw);
    return {
        messageId: row.message_id,
        attachment: MessageAttachment.of({
            fileId: row.file_id,
            position: row.position,
            name: row.name,
            mediaType: row.media_type,
            kind: row.kind,
            sizeBytes: row.size_bytes,
            status: row.status,
        }),
    };
}

function toMessage(raw: unknown, attachments: readonly MessageAttachment[] = []): ChatMessage {
    const row = messageRow.parse(raw);
    return ChatMessage.restore({
        id: row.id,
        sessionId: row.session_id,
        role: ChatRole.parse(row.role),
        source: row.source,
        text: row.text,
        toolCalls: row.tool_calls === null ? null : toolCallsSchema.parse(row.tool_calls),
        durationMs: row.duration_ms,
        attachments,
        dedupKey: row.dedup_key,
        createdAt: row.created_at,
    });
}

function messageIdOf(raw: unknown): number {
    return messageRow.pick({ id: true }).parse(raw).id;
}

@Injectable()
export class ChatSessionRepository extends ChatSessionRepositoryPort {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    /** The connection of the current transaction, or the pool outside one. */
    private get db(): CommonQueryMethods {
        return this.transactions.executor();
    }

    async create(session: ChatSession): Promise<ChatSession> {
        const row = await this.db.one(sql.unsafe`
            INSERT INTO chat_session
                (id, owner_id, channel, title, title_is_custom, created_at, last_activity_at)
            VALUES (${session.id}, ${session.ownerId}, ${session.channel}, ${session.title.value}, ${session.titleIsCustom},
                    ${session.createdAt.toISOString()}, ${session.lastActivityAt.toISOString()})
            RETURNING ${SESSION_COLUMNS}
        `);
        return toSession(row);
    }

    async findById(id: string): Promise<ChatSession | null> {
        const row = await this.db.maybeOne(sql.unsafe`
            SELECT ${SESSION_COLUMNS} FROM chat_session WHERE id = ${id}
        `);
        return row === null ? null : toSession(row);
    }

    async findOwned(id: string, ownerId: string): Promise<ChatSession | null> {
        const row = await this.db.maybeOne(sql.unsafe`
            SELECT ${SESSION_COLUMNS} FROM chat_session
            WHERE id = ${id} AND owner_id = ${ownerId}
        `);
        return row === null ? null : toSession(row);
    }

    async list(ownerId: string): Promise<ChatSession[]> {
        const rows = await this.db.any(sql.unsafe`
            SELECT ${SESSION_COLUMNS} FROM chat_session
            WHERE owner_id = ${ownerId} AND channel = 'app'
            ORDER BY last_activity_at DESC, id
        `);
        return rows.map(toSession);
    }

    async findOrCreateTelegram(ownerId: string): Promise<ChatSession> {
        const fresh = ChatSession.create({ ownerId, channel: 'telegram' });
        // The partial unique index makes concurrent first messages converge on one row.
        await this.db.query(sql.unsafe`
            INSERT INTO chat_session
                (id, owner_id, channel, title, title_is_custom, created_at, last_activity_at)
            VALUES (${fresh.id}, ${ownerId}, 'telegram', ${fresh.title.value}, false,
                    ${fresh.createdAt.toISOString()}, ${fresh.lastActivityAt.toISOString()})
            ON CONFLICT (owner_id) WHERE channel = 'telegram' DO NOTHING
        `);
        const row = await this.db.one(sql.unsafe`
            SELECT ${SESSION_COLUMNS} FROM chat_session
            WHERE owner_id = ${ownerId} AND channel = 'telegram'
        `);
        return toSession(row);
    }

    async findTelegram(ownerId: string): Promise<ChatSession | null> {
        const row = await this.db.maybeOne(sql.unsafe`
            SELECT ${SESSION_COLUMNS} FROM chat_session
            WHERE owner_id = ${ownerId} AND channel = 'telegram'
        `);
        return row === null ? null : toSession(row);
    }

    async listMessages(sessionId: string, ownerId: string): Promise<ChatMessage[]> {
        const { db } = this;
        await this.requireOwned(db, sessionId, ownerId);
        const rows = await db.any(sql.unsafe`
            SELECT ${MESSAGE_COLUMNS} FROM chat_message WHERE session_id = ${sessionId} ORDER BY id
        `);
        const attachmentRows = await db.any(sql.unsafe`
            SELECT ${ATTACHMENT_COLUMNS}
            FROM chat_message_attachment a
            JOIN chat_message m ON m.id = a.message_id
            JOIN stored_file f ON f.id = a.file_id
            WHERE m.session_id = ${sessionId}
            ORDER BY a.message_id, a.position
        `);
        const byMessage = new Map<number, MessageAttachment[]>();
        for (const raw of attachmentRows) {
            const { messageId, attachment } = toAttachment(raw);
            byMessage.set(messageId, [...(byMessage.get(messageId) ?? []), attachment]);
        }
        return rows.map((row) => toMessage(row, byMessage.get(messageIdOf(row)) ?? []));
    }

    async appendUserMessage(
        sessionId: string,
        ownerId: string,
        text: string,
        attachments: readonly string[] = [],
    ): Promise<ChatMessage> {
        return this.transactions.run(async () => {
            const { db } = this;
            const row = await db.maybeOne(sql.unsafe`
                INSERT INTO chat_message (session_id, role, text)
                SELECT id, 'user', ${text} FROM chat_session
                WHERE id = ${sessionId} AND owner_id = ${ownerId}
                RETURNING ${MESSAGE_COLUMNS}
            `);
            if (row === null) throw new ChatSessionNotFoundError(sessionId);
            return this.withAttachments(db, row, attachments);
        });
    }

    async appendAgentAnswer(
        sessionId: string,
        ownerId: string,
        answer: AssistantAnswer,
        autoTitle?: ChatTitle,
    ): Promise<ChatMessage> {
        return this.transactions.run(async () => {
            const tx = this.db;
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
            return this.withAttachments(tx, row, answer.attachments ?? []);
        });
    }

    async appendSystemMessage(
        sessionId: string,
        ownerId: string,
        message: SystemMessageInput,
    ): Promise<ChatMessage | null> {
        return this.transactions.run(async () => {
            const tx = this.db;
            const touched = await tx.maybeOne(sql.unsafe`
                UPDATE chat_session SET last_activity_at = now()
                WHERE id = ${sessionId} AND owner_id = ${ownerId}
                RETURNING id
            `);
            if (touched === null) throw new ChatSessionNotFoundError(sessionId);
            const row = await tx.maybeOne(sql.unsafe`
                INSERT INTO chat_message (session_id, role, source, text, dedup_key)
                VALUES (${sessionId}, 'agent', 'system', ${message.text}, ${message.dedupKey})
                ON CONFLICT (dedup_key) DO NOTHING
                RETURNING ${MESSAGE_COLUMNS}
            `);
            if (row === null) return null;
            return this.withAttachments(tx, row, message.attachments);
        });
    }

    async hasDedupKey(dedupKey: string): Promise<boolean> {
        const row = await this.db.maybeOne(sql.unsafe`
            SELECT 1 AS ok FROM chat_message WHERE dedup_key = ${dedupKey}
        `);
        return row !== null;
    }

    async findFirstSessionWithFile(fileId: string, ownerId: string): Promise<string | null> {
        const row = await this.db.maybeOne(sql.unsafe`
            SELECT m.session_id
            FROM chat_message_attachment a
            JOIN chat_message m ON m.id = a.message_id
            JOIN chat_session s ON s.id = m.session_id
            WHERE a.file_id = ${fileId} AND s.owner_id = ${ownerId} AND m.role = 'user'
            ORDER BY a.message_id
            LIMIT 1
        `);
        return row === null ? null : z.object({ session_id: z.string() }).parse(row).session_id;
    }

    async rename(sessionId: string, ownerId: string, title: ChatTitle): Promise<ChatSession> {
        const row = await this.db.maybeOne(sql.unsafe`
            UPDATE chat_session SET title = ${title.value}, title_is_custom = true
            WHERE id = ${sessionId} AND owner_id = ${ownerId}
            RETURNING ${SESSION_COLUMNS}
        `);
        if (row === null) throw new ChatSessionNotFoundError(sessionId);
        return toSession(row);
    }

    async delete(sessionId: string, ownerId: string): Promise<void> {
        const result = await this.db.query(sql.unsafe`
            DELETE FROM chat_session WHERE id = ${sessionId} AND owner_id = ${ownerId}
        `);
        if (result.rowCount === 0) throw new ChatSessionNotFoundError(sessionId);
    }

    /** Links the files to the stored message in the given order and returns the full message. */
    private async withAttachments(
        db: CommonQueryMethods,
        row: unknown,
        fileIds: readonly string[],
    ): Promise<ChatMessage> {
        if (fileIds.length === 0) return toMessage(row);
        const messageId = messageIdOf(row);
        await db.query(sql.unsafe`
            INSERT INTO chat_message_attachment (message_id, file_id, position)
            SELECT ${messageId}, file_id, (position - 1)::smallint
            FROM unnest(${sql.array([...fileIds], 'uuid')}) WITH ORDINALITY AS t(file_id, position)
        `);
        const attachments = await db.any(sql.unsafe`
            SELECT ${ATTACHMENT_COLUMNS}
            FROM chat_message_attachment a JOIN stored_file f ON f.id = a.file_id
            WHERE a.message_id = ${messageId}
            ORDER BY a.position
        `);
        return toMessage(
            row,
            attachments.map((raw) => toAttachment(raw).attachment),
        );
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
