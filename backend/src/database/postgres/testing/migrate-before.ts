import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../migrator';

const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', '..', 'db', 'migrations');

/**
 * Применяет миграции с именем строго меньше `prefix` (например, '022').
 * Нужен тестам переноса данных: данные вставляются в схему до миграции, затем
 * `migrate(url)` применяет оставшиеся.
 */
export async function migrateBefore(connectionString: string, prefix: string): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), `migrations-before-${prefix}-`));
    try {
        for (const name of (await readdir(MIGRATIONS_DIR)).filter((f) => f < prefix)) {
            await copyFile(join(MIGRATIONS_DIR, name), join(dir, name));
        }
        await migrate(connectionString, dir);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}
