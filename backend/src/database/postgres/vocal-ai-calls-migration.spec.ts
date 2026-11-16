import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './migrator';

// Интеграционный тест: нужна чистая PostgreSQL. Админский URL задаётся через
// PROGRAMS_ETL_TEST_ADMIN_URL. Без него тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

describe.skipIf(adminUrl === undefined)('040_vocal_ai_calls migration', () => {
    const dbName = `vocal_ai_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    const createProject = async (projectId = 'proj-1', title = 'Проект 1'): Promise<void> => {
        await query(`INSERT INTO vocal_ai_projects (project_id, title) VALUES ($1, $2)`, [
            projectId,
            title,
        ]);
    };

    const createCall = async (callId = 1, projectId = 'proj-1'): Promise<void> => {
        await createProject(projectId).catch(() => undefined);
        await query(
            `INSERT INTO vocal_ai_calls (call_id, project_id) VALUES ($1, $2)
             ON CONFLICT (call_id) DO NOTHING`,
            [callId, projectId],
        );
    };

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        const dbUrl = withDatabase(adminUrl ?? '', dbName);
        await migrate(dbUrl);
        client = new Client({ connectionString: dbUrl });
        await client.connect();
    }, 60_000);

    afterAll(async () => {
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('creates all vocal_ai tables', async () => {
        const rows = await query(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name LIKE 'vocal\\_ai\\_%'`,
        );
        expect(rows.map((r) => r.table_name).sort()).toEqual([
            'vocal_ai_call_metric_scores',
            'vocal_ai_call_summaries',
            'vocal_ai_call_tags',
            'vocal_ai_call_transcript_lines',
            'vocal_ai_calls',
            'vocal_ai_projects',
        ]);
    });

    it('allows a project without a synced_at cursor (not synced yet)', async () => {
        await createProject('proj-x', 'Project X');
        const [row] = await query(
            `SELECT last_synced_at FROM vocal_ai_projects WHERE project_id = $1`,
            ['proj-x'],
        );
        expect(row.last_synced_at).toBeNull();
    });

    it('rejects a call referencing an unknown project is allowed (no FK to projects)', async () => {
        // project_id на vocal_ai_calls не обязан иметь существующую запись в vocal_ai_projects
        // (список проектов синхронизации приходит из конфига, а не из БД).
        await query(`INSERT INTO vocal_ai_calls (call_id, project_id) VALUES ($1, $2)`, [
            999,
            'unknown-project',
        ]);
        const rows = await query(`SELECT call_id FROM vocal_ai_calls WHERE call_id = 999`);
        expect(rows).toHaveLength(1);
    });

    it('rejects metric scores for an unknown call', async () => {
        await expect(
            query(
                `INSERT INTO vocal_ai_call_metric_scores
                    (call_id, metric_id, metric_title, score_value, max_score)
                 VALUES ($1, 'm1', 'Metric', 5, 10)`,
                [123456],
            ),
        ).rejects.toThrow();
    });

    it('rejects duplicate metric scores for the same call and metric', async () => {
        await createCall(10);
        await query(
            `INSERT INTO vocal_ai_call_metric_scores
                (call_id, metric_id, metric_title, score_value, max_score)
             VALUES ($1, 'm1', 'Metric', 5, 10)`,
            [10],
        );
        await expect(
            query(
                `INSERT INTO vocal_ai_call_metric_scores
                    (call_id, metric_id, metric_title, score_value, max_score)
                 VALUES ($1, 'm1', 'Metric 2', 7, 10)`,
                [10],
            ),
        ).rejects.toThrow();
    });

    it('rejects duplicate tags for the same call and tag', async () => {
        await createCall(11);
        await query(
            `INSERT INTO vocal_ai_call_tags (call_id, tag_id, tag_title, value)
             VALUES ($1, 't1', 'Tag', 'v1')`,
            [11],
        );
        await expect(
            query(
                `INSERT INTO vocal_ai_call_tags (call_id, tag_id, tag_title, value)
                 VALUES ($1, 't1', 'Tag 2', 'v2')`,
                [11],
            ),
        ).rejects.toThrow();
    });

    it('rejects a transcript line with an unknown speaker role', async () => {
        await createCall(12);
        await expect(
            query(
                `INSERT INTO vocal_ai_call_transcript_lines
                    (call_id, line_index, speaker_name, speaker_role, start_time_seconds,
                     end_time_seconds, text)
                 VALUES ($1, 0, 'Иван', 'unknown', 0, 1, 'текст')`,
                [12],
            ),
        ).rejects.toThrow();
    });

    it('cascades call deletion to metric scores, tags, summaries and transcript lines', async () => {
        await createCall(13);
        await query(
            `INSERT INTO vocal_ai_call_metric_scores
                (call_id, metric_id, metric_title, score_value, max_score)
             VALUES ($1, 'm1', 'Metric', 5, 10)`,
            [13],
        );
        await query(
            `INSERT INTO vocal_ai_call_tags (call_id, tag_id, tag_title, value)
             VALUES ($1, 't1', 'Tag', 'v1')`,
            [13],
        );
        await query(
            `INSERT INTO vocal_ai_call_summaries (call_id, summary_title, summary_text)
             VALUES ($1, 'Summary', 'text')`,
            [13],
        );
        await query(
            `INSERT INTO vocal_ai_call_transcript_lines
                (call_id, line_index, speaker_name, speaker_role, start_time_seconds,
                 end_time_seconds, text)
             VALUES ($1, 0, 'Иван', 'manager', 0, 1, 'текст')`,
            [13],
        );

        await query(`DELETE FROM vocal_ai_calls WHERE call_id = $1`, [13]);

        expect(
            await query(`SELECT 1 FROM vocal_ai_call_metric_scores WHERE call_id = 13`),
        ).toHaveLength(0);
        expect(await query(`SELECT 1 FROM vocal_ai_call_tags WHERE call_id = 13`)).toHaveLength(0);
        expect(
            await query(`SELECT 1 FROM vocal_ai_call_summaries WHERE call_id = 13`),
        ).toHaveLength(0);
        expect(
            await query(`SELECT 1 FROM vocal_ai_call_transcript_lines WHERE call_id = 13`),
        ).toHaveLength(0);
    });
});
