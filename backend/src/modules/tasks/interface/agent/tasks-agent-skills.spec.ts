import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AIMessage, SystemMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { fakeModel } from '@langchain/core/testing';
import { createAgent } from 'langchain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ReadOnlyFilesystemBackend,
    TASKS_AGENT_SKILLS_DIR,
    assertTaskSkillsPresent,
    createTaskSkillsMiddleware,
} from './tasks-agent-skills';

const SKILL = `---
name: demo-skill
description: Использовать, когда нужен демо-скилл.
---

# Демо

Секретная инструкция скилла.
`;

let dir: string;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tasks-skills-'));
    mkdirSync(join(dir, 'demo-skill'));
    writeFileSync(join(dir, 'demo-skill', 'SKILL.md'), SKILL);
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

function systemText(messages: BaseMessage[]): string {
    const system = messages.find((message) => SystemMessage.isInstance(message));
    return typeof system?.content === 'string' ? system.content : JSON.stringify(system?.content);
}

describe('createTaskSkillsMiddleware inside langchain createAgent (spike 1.3)', () => {
    it('lists the skill in the system prompt and gives the model only read_file', async () => {
        const model = fakeModel().respond(new AIMessage('ok'));
        const bindTools = vi.spyOn(model, 'bindTools');
        const agent = createAgent({
            model,
            tools: [],
            systemPrompt: 'Базовый промпт',
            middleware: createTaskSkillsMiddleware(dir),
        });

        await agent.invoke({ messages: [{ role: 'user', content: 'привет' }] });

        const toolNames = bindTools.mock.calls
            .flatMap(([tools]) => tools)
            .map((tool) => (tool as { name: string }).name);
        expect([...new Set(toolNames)]).toEqual(['read_file']);
        const prompt = systemText(model.calls[0].messages);
        expect(prompt).toContain('Базовый промпт');
        expect(prompt).toContain('demo-skill');
        expect(prompt).toContain('Использовать, когда нужен демо-скилл.');
        expect(prompt).toContain('/demo-skill/SKILL.md');
        expect(prompt).not.toContain('Секретная инструкция');
    });

    it('lets the model read the SKILL.md through read_file', async () => {
        const model = fakeModel()
            .respondWithTools([
                { name: 'read_file', args: { file_path: '/demo-skill/SKILL.md', limit: 1000 } },
            ])
            .respond(new AIMessage('прочитал'));
        const agent = createAgent({
            model,
            tools: [],
            middleware: createTaskSkillsMiddleware(dir),
        });

        const result = await agent.invoke({ messages: [{ role: 'user', content: 'создай' }] });

        const toolMessage = result.messages.find((message) => ToolMessage.isInstance(message));
        expect(JSON.stringify(toolMessage?.content)).toContain('Секретная инструкция скилла.');
    });

    it('refuses to call write tools and does not touch the skills folder', async () => {
        const model = fakeModel()
            .respondWithTools([
                { name: 'write_file', args: { file_path: '/evil.md', content: 'x' } },
            ])
            .respond(new AIMessage('ок'));
        const agent = createAgent({
            model,
            tools: [],
            middleware: createTaskSkillsMiddleware(dir),
        });

        await agent
            .invoke({ messages: [{ role: 'user', content: 'запиши' }] })
            .catch(() => undefined);

        expect(readdirSync(dir)).toEqual(['demo-skill']);
    });

    it('does not offload a large tool result into the skills folder', async () => {
        const huge = 'я'.repeat(300_000);
        writeFileSync(join(dir, 'demo-skill', 'big.md'), 'строка\n'.repeat(20_000));
        const model = fakeModel()
            .respondWithTools([
                { name: 'read_file', args: { file_path: '/demo-skill/big.md', limit: 20_000 } },
            ])
            .respond(new AIMessage('ок'));
        const agent = createAgent({
            model,
            tools: [],
            middleware: createTaskSkillsMiddleware(dir),
        });

        await agent.invoke({ messages: [{ role: 'user', content: huge }] });

        expect(readdirSync(dir)).toEqual(['demo-skill']);
        expect(readdirSync(join(dir, 'demo-skill')).sort()).toEqual(['SKILL.md', 'big.md']);
    });
});

describe('ReadOnlyFilesystemBackend', () => {
    it('reads files under its root but rejects every write', async () => {
        const backend = new ReadOnlyFilesystemBackend(dir);

        const read = await backend.read('/demo-skill/SKILL.md');
        expect(JSON.stringify(read)).toContain('Секретная инструкция');
        expect((await backend.write('/x.md', 'x')).error).toBeTruthy();
        expect((await backend.edit('/demo-skill/SKILL.md', 'Демо', 'Зло')).error).toBeTruthy();
        expect((await backend.delete('/demo-skill/SKILL.md')).error).toBeTruthy();
        const [upload] = await backend.uploadFiles([['/y.md', new Uint8Array([1])]]);
        expect(upload.error).toBe('permission_denied');
        expect(readdirSync(dir)).toEqual(['demo-skill']);
        expect(readdirSync(join(dir, 'demo-skill'))).toEqual(['SKILL.md']);
    });

    it('cannot escape its root', async () => {
        const backend = new ReadOnlyFilesystemBackend(join(dir, 'demo-skill'));

        const read = await backend.read('/../../etc/passwd');
        expect(JSON.stringify(read)).not.toMatch(/root:/);
    });
});

describe('assertTaskSkillsPresent', () => {
    it('accepts the skills folder next to the module', () => {
        expect(() => {
            assertTaskSkillsPresent(TASKS_AGENT_SKILLS_DIR);
        }).not.toThrow();
    });

    it('fails fast when the task-creation skill is missing', () => {
        expect(() => {
            assertTaskSkillsPresent(dir);
        }).toThrow(/task-creation/);
    });
});
