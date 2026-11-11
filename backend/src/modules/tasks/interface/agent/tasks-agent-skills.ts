import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentMiddleware } from 'langchain';
import {
    FilesystemBackend,
    createFilesystemMiddleware,
    createSkillsMiddleware,
    type DeleteResult,
    type EditResult,
    type FileUploadResponse,
    type WriteResult,
} from 'deepagents';
import { InternalError } from '../../../../shared/errors';

/**
 * Folder with the skills of the tasks agent, next to this module: `src/...` in tests,
 * `dist/...` in the build (nest-cli copies the `SKILL.md` files as assets).
 */
export const TASKS_AGENT_SKILLS_DIR = join(__dirname, 'skills');

/** Skills the tasks agent cannot work without: creation needs its confirmation rules. */
export const TASKS_AGENT_REQUIRED_SKILLS: readonly string[] = ['task-creation'];

/** Fails at startup when a required `SKILL.md` is missing, instead of losing its rules silently. */
export function assertTaskSkillsPresent(skillsDir: string): void {
    const missing = TASKS_AGENT_REQUIRED_SKILLS.filter(
        (name) => !existsSync(join(skillsDir, name, 'SKILL.md')),
    );
    if (missing.length > 0) {
        throw new InternalError(
            `Tasks agent skills are missing in ${skillsDir}: ${missing.join(', ')}`,
        );
    }
}

const READ_ONLY = 'Скиллы доступны только для чтения.';

/**
 * Filesystem backend rooted at the skills folder (virtual paths, no escape above the root)
 * that refuses every write: the agent may only read the skills.
 */
export class ReadOnlyFilesystemBackend extends FilesystemBackend {
    constructor(rootDir: string) {
        super({ rootDir, virtualMode: true });
    }

    override write(_filePath: string, _content: string): Promise<WriteResult> {
        return Promise.resolve({ error: READ_ONLY });
    }

    override edit(
        _filePath: string,
        _oldString: string,
        _newString: string,
        _replaceAll?: boolean,
    ): Promise<EditResult> {
        return Promise.resolve({ error: READ_ONLY });
    }

    override delete(_filePath: string): Promise<DeleteResult> {
        return Promise.resolve({ error: READ_ONLY });
    }

    override uploadFiles(files: [string, Uint8Array][]): Promise<FileUploadResponse[]> {
        return Promise.resolve(files.map(([path]) => ({ path, error: 'permission_denied' })));
    }
}

/**
 * Middleware that shows the skills (name, description, path) in the system prompt and lets
 * the model read a `SKILL.md` with `read_file`. The deepagents skills middleware has no tool
 * of its own, so the filesystem middleware is added with `read_file` only; offloading of large
 * messages is off because it would write to the backend.
 */
export function createTaskSkillsMiddleware(skillsDir: string): AgentMiddleware[] {
    const backend = new ReadOnlyFilesystemBackend(skillsDir);
    return [
        createFilesystemMiddleware({
            backend,
            tools: ['read_file'],
            toolTokenLimitBeforeEvict: null,
            humanMessageTokenLimitBeforeEvict: null,
            permissions: [{ operations: ['write'], paths: ['/**'], mode: 'deny' }],
        }),
        createSkillsMiddleware({ backend, sources: ['/'] }),
    ];
}
