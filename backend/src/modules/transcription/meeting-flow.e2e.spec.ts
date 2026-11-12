import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    DeleteBucketCommand,
    DeleteObjectsCommand,
    ListObjectsV2Command,
    S3Client,
} from '@aws-sdk/client-s3';
import { AIMessage } from '@langchain/core/messages';
import { fakeModel, type FakeBuiltModel } from '@langchain/core/testing';
import { Module, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
import JSZip from 'jszip';
import { LoggerModule } from 'nestjs-pino';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { PostgresModule } from '../../database/postgres/postgres.module';
import { validateEnv } from '../../shared/config/env.schema';
import { RequestContextMiddleware } from '../../shared/context/request-context.middleware';
import { HttpExceptionFilter } from '../../shared/http/http-exception.filter';
import { OutboxSettings } from '../../shared/outbox/infrastructure/outbox-settings';
import { OutboxModule } from '../../shared/outbox/outbox.module';
import { QueueRootModule } from '../../shared/queue/queue-root.module';
import { connectTestRedis, testRedisOptions } from '../../shared/testing/test-redis';
import { FindActiveUserUseCase } from '../auth/application/find-active-user.use-case';
import { AuthModule } from '../auth/auth.module';
import { AccessTokenService } from '../auth/domain/ports/access-token-service.port';
import { UserRepository } from '../auth/domain/ports/user-repository.port';
import { JwtAccessTokenService } from '../auth/infrastructure/jwt-access-token.service';
import { SlonikUserRepository } from '../auth/infrastructure/slonik-user.repository';
import { registerAuthErrorStatuses } from '../auth/interface/auth-error-status';
import { JwtAuthGuard } from '../auth/interface/http/jwt-auth.guard';
import { PasswordChangeGuard } from '../auth/interface/http/password-change.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksModule } from '../tasks/tasks.module';
import type { DiarizedTranscript } from './meeting/domain/diarized-transcript';
import { MeetingTranscriberPort } from './meeting/domain/ports/meeting-transcriber.port';
import { TaskExtractorPort } from './meeting/domain/ports/task-extractor.port';
import { MeetingChatModule } from './meeting/meeting-chat.module';
import { FakeMeetingTranscriber } from './meeting/testing/fake-meeting-transcriber';
import { FakeTaskExtractor } from './meeting/testing/fake-task-extractor';

/**
 * Сквозной сценарий встречи: запись в чат → расшифровка → сообщение системы с документом и
 * уведомлением → имена спикеров → задачи из встречи → постановка списка с другим постановщиком.
 * Postgres, Redis (BullMQ) и MinIO настоящие; подменены только провайдер расшифровки,
 * извлечение задач и чат-модели агентов.
 */

const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;
const s3Endpoint = process.env.FILES_TEST_S3_ENDPOINT;

// Все агенты (оркестратор и специалисты) получают одну модель-двойник: вызовы идут по очереди,
// поэтому ответы ставятся в общую очередь в порядке шагов сценария.
const llm = vi.hoisted((): { model: unknown } => ({ model: null }));
vi.mock('../../shared/llm', () => ({ createChatModel: () => llm.model }));

const SECRET = 's'.repeat(40);
// Отдельная база Redis: очереди BullMQ не пересекаются с другими тестами и dev-бэкендом.
const REDIS_DB = 12;
const DEADLINE_MS = 15_000;
const RECORDING_NAME = 'Планёрка.ogg';
const RECORDING_PATH = join(__dirname, 'bench', 'voice-492965.ogg');

const tokens = new JwtAccessTokenService({
    secret: SECRET,
    ttlSeconds: 900,
    clock: { now: () => new Date() },
});

@Module({
    imports: [PostgresModule],
    providers: [
        { provide: AccessTokenService, useValue: tokens },
        { provide: UserRepository, useClass: SlonikUserRepository },
        FindActiveUserUseCase,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: PasswordChangeGuard },
    ],
    exports: [AccessTokenService, FindActiveUserUseCase],
})
class AuthStubModule {}

const storedFileSchema = z.object({ id: z.string(), name: z.string(), kind: z.string() });
const chatSchema = z.object({ id: z.string() });
const attachmentSchema = z.object({ id: z.string(), name: z.string(), kind: z.string() });
const historySchema = z.object({
    messages: z.array(
        z
            .object({
                role: z.string(),
                content: z.unknown().optional(),
                source: z.string(),
                attachments: z.array(attachmentSchema),
            })
            .loose(),
    ),
    running: z.boolean(),
});
const notificationsSchema = z.object({
    items: z.array(
        z.object({
            type: z.string(),
            title: z.string(),
            body: z.string(),
            target: z.object({ type: z.string(), id: z.string() }),
            actorId: z.string().nullable(),
        }),
    ),
});
const downloadLinkSchema = z.object({ url: z.string() });
const agUiEventSchema = z
    .object({ type: z.string(), name: z.string().optional(), value: z.unknown().optional() })
    .loose();

type History = z.infer<typeof historySchema>;
type HistoryMessage = History['messages'][number];
type Notifications = z.infer<typeof notificationsSchema>['items'];

interface User {
    readonly id: string;
    readonly login: string;
}

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

function pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function eventually<T>(
    what: string,
    read: () => Promise<T>,
    done: (value: T) => boolean,
): Promise<T> {
    const deadline = Date.now() + DEADLINE_MS;
    let last = await read();
    while (!done(last)) {
        if (Date.now() > deadline) throw new Error(`${what} did not happen in time`);
        await pause(100);
        last = await read();
    }
    return last;
}

function toolCall(name: string, args: Record<string, unknown>): AIMessage {
    return new AIMessage({ content: '', tool_calls: [{ id: `call-${randomUUID()}`, name, args }] });
}

/** Оркестратор передаёт задачу специалисту, тот вызывает свой инструмент, оба отвечают текстом. */
function delegate(
    model: FakeBuiltModel,
    specialist: 'meetings' | 'tasks',
    call: { name: string; args: Record<string, unknown> },
    answer: string,
): void {
    model
        .respond(toolCall('task', { description: answer, subagent_type: specialist }))
        .respond(toolCall(call.name, call.args))
        .respond(new AIMessage(answer))
        .respond(new AIMessage(answer));
}

const transcript: DiarizedTranscript = {
    language: 'ru',
    durationSec: 40,
    segments: [
        { seq: 0, speaker: 1, startSec: 0, endSec: 6, text: 'Добрый день, начинаем планёрку.' },
        { seq: 1, speaker: 2, startSec: 6, endSec: 12, text: 'Я готов рассказать о клиенте.' },
        {
            seq: 2,
            speaker: 1,
            startSec: 12,
            endSec: 25,
            text: 'Борис, подготовь коммерческое предложение для клиента.',
        },
        { seq: 3, speaker: 2, startSec: 25, endSec: 40, text: 'Хорошо, подготовлю.' },
    ],
};

describe.skipIf(adminUrl === undefined || s3Endpoint === undefined)(
    'meeting flow (recording in a chat to tasks set on behalf of another user)',
    () => {
        const databaseName = `meeting_flow_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
        const bucket = `meeting-flow-${randomUUID().slice(0, 8)}`;
        const s3 = new S3Client({
            endpoint: s3Endpoint,
            region: process.env.FILES_TEST_S3_REGION ?? 'us-east-1',
            forcePathStyle: true,
            credentials: {
                accessKeyId: process.env.FILES_TEST_S3_ACCESS_KEY ?? 'minioadmin',
                secretAccessKey: process.env.FILES_TEST_S3_SECRET_KEY ?? 'minioadmin',
            },
        });
        let app: INestApplication | undefined;
        let client: Client | undefined;
        let redis: Redis | null = null;
        let base: string;
        let storageDir: string | undefined;
        let model: FakeBuiltModel;
        let releaseTranscription: () => void = () => undefined;
        const transcriptionGate = new Promise<void>((resolve) => {
            releaseTranscription = resolve;
        });
        const transcriber = new FakeMeetingTranscriber(async (audio) => {
            // Поток из MinIO дочитывается, как это сделал бы настоящий провайдер.
            audio.stream.resume();
            await new Promise((resolve) => audio.stream.once('end', resolve));
            // Расшифровка «завершается» только после первого ответа агента: запись уже в чате.
            await transcriptionGate;
            return transcript;
        });
        const extractor = new FakeTaskExtractor(() => [
            {
                title: 'Подготовить коммерческое предложение',
                description: 'КП для клиента с планёрки',
                assigneeMention: 'Борис',
                dueText: null,
                evidence: { seq: 2, quote: 'подготовь коммерческое предложение' },
            },
        ]);

        let anna: User;
        let boris: User;
        let vera: User;

        const bearer = (user: User): Record<string, string> => ({
            authorization: `Bearer ${tokens.sign({ sub: user.id, sid: 'session-1', mcp: false }).token}`,
        });

        async function addUser(prefix: string): Promise<User> {
            const id = randomUUID();
            const login = `${prefix}_${id.slice(0, 6)}`;
            await client?.query(
                'INSERT INTO auth_users (id, login, password_hash, is_active) VALUES ($1, $2, $3, true)',
                [id, login, '$argon2id$fake'],
            );
            return { id, login };
        }

        async function getJson<T>(user: User, path: string, schema: z.ZodType<T>): Promise<T> {
            const response = await fetch(`${base}${path}`, { headers: bearer(user) });
            expect(response.status, `GET ${path}`).toBe(200);
            return schema.parse(await response.json());
        }

        async function sendJson(
            user: User,
            method: string,
            path: string,
            body: unknown,
        ): Promise<Response> {
            return fetch(`${base}${path}`, {
                method,
                headers: { ...bearer(user), 'content-type': 'application/json' },
                body: JSON.stringify(body),
            });
        }

        /** Запуск агента (AG-UI по SSE): ответ читается до конца потока. */
        async function run(
            user: User,
            chatId: string,
            text: string,
            fileIds: string[] = [],
        ): Promise<z.infer<typeof agUiEventSchema>[]> {
            const response = await sendJson(user, 'POST', '/agent', {
                threadId: chatId,
                runId: randomUUID(),
                messages: [{ id: randomUUID(), role: 'user', content: text }],
                ...(fileIds.length === 0 ? {} : { forwardedProps: { fileIds } }),
            });
            expect(response.status).toBe(200);
            const events = (await response.text())
                .split('\n')
                .filter((line) => line.startsWith('data: '))
                .map((line) => agUiEventSchema.parse(JSON.parse(line.slice('data: '.length))));
            expect(events.at(-1)?.type, JSON.stringify(events.at(-1))).toBe('RUN_FINISHED');
            return events;
        }

        function attachedFiles(events: z.infer<typeof agUiEventSchema>[]): string[] {
            return events
                .filter((e) => e.type === 'CUSTOM' && e.name === 'file-attached')
                .map((e) => z.object({ name: z.string() }).parse(e.value).name);
        }

        const history = (chatId: string): Promise<History> =>
            getJson(anna, `/threads/${chatId}/messages`, historySchema);

        /** Сообщения истории, когда запуск закончен и условие выполнено. */
        async function historyWhen(
            chatId: string,
            what: string,
            done: (messages: HistoryMessage[]) => boolean,
        ): Promise<HistoryMessage[]> {
            const loaded = await eventually(
                what,
                () => history(chatId),
                (h) => !h.running && done(h.messages),
            );
            return loaded.messages;
        }

        /** Id документа, который появился в истории у сообщения агента и не встречался раньше. */
        const seenDocuments = new Set<string>();
        async function newDocument(chatId: string, name: string, source = 'run'): Promise<string> {
            const isNew = (m: HistoryMessage): boolean =>
                m.role === 'assistant' &&
                m.source === source &&
                m.attachments.some((a) => a.name === name && !seenDocuments.has(a.id));
            const messages = await historyWhen(chatId, `document ${name}`, (all) =>
                all.some(isNew),
            );
            const id =
                messages
                    .find(isNew)
                    ?.attachments.find((a) => a.name === name && !seenDocuments.has(a.id))?.id ??
                '';
            seenDocuments.add(id);
            return id;
        }

        const notificationsOf = async (user: User): Promise<Notifications> =>
            (await getJson(user, '/notifications', notificationsSchema)).items;

        /** Текст документа `.docx`, скачанного по ссылке, как его скачал бы клиент. */
        async function documentText(user: User, fileId: string): Promise<string> {
            const linkResponse = await sendJson(user, 'POST', `/files/${fileId}/download-link`, {});
            expect(linkResponse.status).toBe(200);
            const { url } = downloadLinkSchema.parse(await linkResponse.json());
            const content = await fetch(`${base}${url}`);
            expect(content.status).toBe(200);
            const zip = await JSZip.loadAsync(Buffer.from(await content.arrayBuffer()));
            const xml = (await zip.file('word/document.xml')?.async('string')) ?? '';
            return xml
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        beforeAll(async () => {
            if (adminUrl === undefined) return;
            redis = await connectTestRedis();
            if (redis === null) return;
            registerAuthErrorStatuses();
            model = fakeModel();
            llm.model = model;
            const admin = new Client({ connectionString: adminUrl });
            await admin.connect();
            await admin.query(`CREATE DATABASE ${databaseName}`);
            await admin.end();
            const databaseUrl = withDatabase(adminUrl, databaseName);
            storageDir = await mkdtemp(join(tmpdir(), 'meeting-flow-'));
            const redisOptions = testRedisOptions();
            const env = validateEnv({
                NODE_ENV: 'test',
                POSTGRES_URL: databaseUrl,
                MSSQL_URL: 'mssql://unused',
                JWT_SECRET: SECRET,
                REDIS_HOST: redisOptions.host,
                REDIS_PORT: redisOptions.port,
                REDIS_PASSWORD: redisOptions.password,
                REDIS_DB: REDIS_DB,
                OPENROUTER_API_KEY: 'test-key',
                TASKS_STORAGE_DIR: storageDir,
                S3_ENDPOINT: s3Endpoint,
                S3_ACCESS_KEY: process.env.FILES_TEST_S3_ACCESS_KEY ?? 'minioadmin',
                S3_SECRET_KEY: process.env.FILES_TEST_S3_SECRET_KEY ?? 'minioadmin',
                S3_BUCKET: bucket,
                FILES_DOWNLOAD_TOKEN_SECRET: 'd'.repeat(40),
                OUTBOX_POLL_INTERVAL_MS: 100,
                CHAT_SYSTEM_MESSAGE_RETRY_MS: 200,
                CHAT_SYSTEM_MESSAGE_DEADLINE_MS: 10_000,
            });
            const moduleRef = await Test.createTestingModule({
                imports: [
                    ConfigModule.forRoot({
                        isGlobal: true,
                        ignoreEnvFile: true,
                        ignoreEnvVars: true,
                        load: [() => env],
                    }),
                    LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
                    OutboxModule,
                    QueueRootModule,
                    TasksModule,
                    NotificationsModule,
                    MeetingChatModule,
                ],
                providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
            })
                .overrideModule(AuthModule)
                .useModule(AuthStubModule)
                .overrideProvider(OutboxSettings)
                .useValue(
                    new OutboxSettings({
                        pollIntervalMs: 100,
                        batchSize: 20,
                        maxAttempts: 5,
                        retentionDays: 7,
                        handlerTimeoutMs: 10_000,
                    }),
                )
                .overrideProvider(MeetingTranscriberPort)
                .useValue(transcriber)
                .overrideProvider(TaskExtractorPort)
                .useValue(extractor)
                .compile();
            app = moduleRef.createNestApplication({ logger: false });
            const requestContext = new RequestContextMiddleware();
            app.use(requestContext.use.bind(requestContext));
            await app.listen(0);
            base = (await app.getUrl()).replace('[::1]', 'localhost');
            client = new Client({ connectionString: databaseUrl });
            await client.connect();
            anna = await addUser('anna');
            boris = await addUser('boris');
            vera = await addUser('vera');
        }, 60_000);

        afterAll(async () => {
            releaseTranscription();
            await app?.close();
            await client?.end();
            if (storageDir !== undefined) await rm(storageDir, { recursive: true, force: true });
            if (redis !== null) {
                await redis.quit();
                const queues = new Redis({ ...testRedisOptions(), db: REDIS_DB });
                const keys = await queues.keys('bull:*');
                if (keys.length > 0) await queues.del(...keys);
                await queues.quit();
            }
            if (adminUrl !== undefined) {
                const admin = new Client({ connectionString: adminUrl });
                await admin.connect();
                await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
                await admin.end();
            }
            const listed = await s3
                .send(new ListObjectsV2Command({ Bucket: bucket }))
                .catch(() => null);
            const objects = (listed?.Contents ?? []).map(({ Key }) => ({ Key }));
            if (objects.length > 0) {
                await s3.send(
                    new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects } }),
                );
            }
            await s3.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => undefined);
            s3.destroy();
        });

        it('takes a recording from the chat to a transcript, speaker names, meeting tasks and tasks set on behalf of another user', async (ctx) => {
            if (redis === null) {
                ctx.skip();
                return;
            }

            // 1. Запись загружается и отправляется в чат: агент отвечает, что расшифровка идёт.
            const form = new FormData();
            form.append('file', new Blob([await readFile(RECORDING_PATH)]), RECORDING_NAME);
            const uploaded = await fetch(`${base}/files`, {
                method: 'POST',
                headers: bearer(anna),
                body: form,
            });
            expect(uploaded.status).toBe(201);
            const recording = storedFileSchema.parse(await uploaded.json());
            expect(recording.kind).toBe('recording');
            const created = await sendJson(anna, 'POST', '/threads', { title: 'Планёрка' });
            expect(created.status).toBe(201);
            const chatId = chatSchema.parse(await created.json()).id;

            delegate(
                model,
                'meetings',
                { name: 'get_meeting_transcript', args: { fileId: recording.id } },
                'Расшифровка запущена, результат придёт в этот чат.',
            );
            await run(anna, chatId, '', [recording.id]);
            const pendingTool = model.calls[2]?.messages.at(-1);
            expect(pendingTool?.text).toMatch(/"status":"(pending|processing)"/);
            const afterRun = await historyWhen(chatId, 'answer of the first run', (all) =>
                all.some((m) => m.role === 'assistant'),
            );
            expect(afterRun.find((m) => m.role === 'user')).toMatchObject({
                role: 'user',
                source: 'run',
                attachments: [{ id: recording.id, name: RECORDING_NAME, kind: 'recording' }],
            });

            // 2. Расшифровка готова: сообщение системы с документом в истории и уведомление.
            releaseTranscription();
            const firstDocument = await newDocument(
                chatId,
                'Расшифровка — Планёрка.docx',
                'system',
            );
            const systemMessages = (await history(chatId)).messages.filter(
                (m) => m.source === 'system',
            );
            expect(systemMessages).toHaveLength(1);
            expect(systemMessages[0]).toMatchObject({ role: 'assistant' });
            expect(systemMessages[0]?.attachments).toEqual([
                expect.objectContaining({ id: firstDocument, kind: 'document' }),
            ]);
            const firstText = await documentText(anna, firstDocument);
            expect(firstText).toContain('Спикер 1');
            expect(firstText).toContain('Борис, подготовь коммерческое предложение для клиента.');
            const ready = await eventually(
                'transcript-ready notification',
                () => notificationsOf(anna),
                (items) => items.some((n) => n.type === 'meeting-transcript.ready'),
            );
            expect(ready.find((n) => n.type === 'meeting-transcript.ready')?.target).toEqual({
                type: 'chat',
                id: chatId,
            });

            // 3. Имена спикеров через PUT, затем новый документ расшифровки с этими именами.
            const renamed = await sendJson(anna, 'PUT', `/transcripts/${recording.id}/speakers`, {
                speakers: [
                    { speaker: 1, name: 'Анна' },
                    { speaker: 2, name: 'Борис' },
                ],
            });
            expect(renamed.status).toBe(200);
            delegate(
                model,
                'meetings',
                {
                    name: 'get_meeting_transcript',
                    args: { fileId: recording.id, withDocument: true },
                },
                'Документ расшифровки с именами приложен. Извлечь задачи из встречи?',
            );
            const reissued = await run(anna, chatId, 'Пришли расшифровку с именами');
            expect(attachedFiles(reissued)).toEqual(['Расшифровка — Планёрка.docx']);
            const secondDocument = await newDocument(chatId, 'Расшифровка — Планёрка.docx');
            expect(secondDocument).not.toBe('');
            expect(secondDocument).not.toBe(firstDocument);
            const secondText = await documentText(anna, secondDocument);
            expect(secondText).toContain('Анна');
            expect(secondText).toContain('Борис: Хорошо, подготовлю.');
            expect(secondText).not.toContain('Спикер 1');

            // 4. Извлечение задач из встречи: документ со списком.
            delegate(
                model,
                'meetings',
                { name: 'extract_meeting_tasks', args: { fileId: recording.id } },
                'Нашёл одну задачу, список приложен. Создать задачи в системе?',
            );
            const extracted = await run(anna, chatId, 'Да, извлеки задачи');
            expect(attachedFiles(extracted)).toEqual(['Задачи — Планёрка.docx']);
            const tasksDocument = await newDocument(chatId, 'Задачи — Планёрка.docx');
            const tasksText = await documentText(anna, tasksDocument);
            expect(tasksText).toContain('Подготовить коммерческое предложение');
            expect(tasksText).toContain('подготовь коммерческое предложение');
            expect(extractor.extractions).toHaveLength(1);
            expect(extractor.extractions[0]?.lines.join('\n')).toContain('Анна');

            // 5. Постановка списка: постановщик — Вера, инициатор — Анна; одно подтверждение.
            delegate(
                model,
                'tasks',
                {
                    name: 'propose_tasks',
                    args: {
                        items: [
                            {
                                title: 'Подготовить коммерческое предложение',
                                description: 'КП для клиента с планёрки',
                                assigneeId: boris.id,
                                creatorId: vera.id,
                                sourceNote: '[00:00:12] Анна: «подготовь коммерческое предложение»',
                            },
                        ],
                        origin: { fileId: recording.id, recordingName: RECORDING_NAME },
                    },
                },
                'Создать задачу 1 от имени Веры?',
            );
            await run(anna, chatId, `Создавай, постановщик ${vera.login}`);
            const drafts = await client?.query<{ id: string; status: string }>(
                'SELECT id, status FROM task_batch_draft WHERE thread_id = $1',
                [chatId],
            );
            expect(drafts?.rows).toEqual([{ id: expect.any(String) as string, status: 'draft' }]);
            const draftId = drafts?.rows[0]?.id ?? '';

            delegate(
                model,
                'tasks',
                { name: 'create_tasks', args: { draftId } },
                'Задача создана, итог приложен.',
            );
            const createdTasks = await run(anna, chatId, 'Да');
            expect(attachedFiles(createdTasks)).toEqual(['Поставленные задачи — Планёрка.docx']);
            const createTool = model.calls.at(-2)?.messages.at(-1)?.text ?? '';
            expect(createTool).toContain('"createdCount":1');

            const tasks = await client?.query<{
                title: string;
                creator_id: string;
                initiator_id: string;
                assignee_id: string;
            }>('SELECT title, creator_id, initiator_id, assignee_id FROM task');
            expect(tasks?.rows).toEqual([
                {
                    title: 'Подготовить коммерческое предложение',
                    creator_id: vera.id,
                    initiator_id: anna.id,
                    assignee_id: boris.id,
                },
            ]);
            const reportId = await newDocument(chatId, 'Поставленные задачи — Планёрка.docx');
            const reportText = await documentText(anna, reportId);
            expect(reportText).toContain('Подготовить коммерческое предложение');
            expect(reportText).toContain(boris.login);
            expect(reportText).toContain(vera.login);
            expect(reportText).toContain('Создана');

            const onBehalf = await eventually(
                'created-on-behalf notification',
                () => notificationsOf(vera),
                (items) => items.some((n) => n.type === 'task.created-on-behalf'),
            );
            expect(onBehalf.find((n) => n.type === 'task.created-on-behalf')).toMatchObject({
                actorId: anna.id,
                target: { type: 'task' },
            });

            // Повторное подтверждение ничего не создаёт: черновик уже использован.
            delegate(
                model,
                'tasks',
                { name: 'create_tasks', args: { draftId } },
                'Эти задачи уже созданы.',
            );
            await run(anna, chatId, 'Да');
            expect(model.calls.at(-2)?.messages.at(-1)?.text).toContain('"created":false');
            const count = await client?.query<{ n: string }>('SELECT count(*) AS n FROM task');
            expect(count?.rows[0]?.n).toBe('1');
        }, 90_000);
    },
);
