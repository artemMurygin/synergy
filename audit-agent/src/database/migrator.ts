import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';

// Миграции лежат в db/migrations как NNN_name.sql; применяются по порядку один раз.
// Выполняются через pg (simple query protocol), т.к. Slonik не пускает многооператорный SQL.
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'db', 'migrations');

export async function migrate(connectionString: string, dir = MIGRATIONS_DIR) {
    const client = new Client({ connectionString });
    await client.connect();
    try {
        // advisory lock защищает от гонки при одновременном старте нескольких инстансов
        await client.query('SELECT pg_advisory_lock(727274)');
        await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
        const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

        for (const name of files) {
            const { rowCount } = await client.query(
                'SELECT 1 FROM schema_migrations WHERE name = $1',
                [name],
            );
            if (rowCount) continue;
            const body = await readFile(join(dir, name), 'utf8');
            await client.query('BEGIN');
            try {
                await client.query(body);
                await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
                await client.query('COMMIT');
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            }
        }
    } finally {
        await client.end();
    }
}
