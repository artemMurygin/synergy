import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSkillMetadata } from 'deepagents';
import { describe, expect, it } from 'vitest';
import { TASKS_AGENT_SKILLS_DIR } from './tasks-agent-skills';

const SKILL_PATH = join(TASKS_AGENT_SKILLS_DIR, 'task-creation', 'SKILL.md');

function body(): string {
    return readFileSync(SKILL_PATH, 'utf8').replace(/^---[\s\S]*?\n---\n/, '');
}

function section(title: RegExp): string {
    const text = body();
    const headings = [...text.matchAll(/^## (.+)$/gm)];
    const index = headings.findIndex((heading) => title.test(heading[1]));
    expect(index, `section ${String(title)}`).toBeGreaterThanOrEqual(0);
    const start = headings[index].index;
    const end = headings[index + 1]?.index ?? text.length;
    return text.slice(start, end);
}

describe('task-creation SKILL.md', () => {
    it('has valid frontmatter with the skill name and when to use it', () => {
        const metadata = parseSkillMetadata(SKILL_PATH, 'project');

        expect(metadata?.name).toBe('task-creation');
        expect(metadata?.description).toMatch(/создать задачу/i);
    });

    it('lists the fields with their limits and resolves people through find_users', () => {
        const fields = section(/^Поля/);

        expect(fields).toMatch(/назван|заголов/i);
        expect(fields).toMatch(/обязательн/i);
        expect(fields).toMatch(/описани/i);
        expect(fields).toMatch(/срок/i);
        expect(fields).toMatch(/ответственн/i);
        expect(fields).toMatch(/наблюдател/i);
        expect(fields).toMatch(/200/);
        expect(fields).toMatch(/10 ?000/);
        expect(fields).toMatch(/50/);
        expect(body()).toContain('find_users');
    });

    it('asks for the title and offers missing optional fields once in one message', () => {
        const order = section(/^Порядок/);

        expect(order).toMatch(/спроси.*назван|назван.*спроси/i);
        expect(order).toMatch(/одним сообщением/i);
        expect(order).toMatch(/пропуст/i);
        expect(order).toMatch(/не придумывай/i);
    });

    it('describes the card: logins for people and a concrete date and time in MSK', () => {
        const card = section(/^Карточка/);

        expect(card).toMatch(/логин/i);
        expect(card).toMatch(/дат/i);
        expect(card).toMatch(/МСК/);
        expect(card).toMatch(/Создать\?|подтвер/i);
    });

    it('creates only after an explicit confirmation to the card', () => {
        const confirm = section(/^Подтверждение/);

        expect(confirm).toMatch(/явн/i);
        expect(confirm).toMatch(/«да»/);
        expect(confirm).toContain('create_task');
        expect(confirm).toMatch(/другую тему|не ответил/i);
    });

    it('turns an edit into a new card and a cancel into no task', () => {
        expect(section(/^Правка/)).toMatch(/нов(ую|ая) карточк/i);
        const cancel = section(/^Отмена/);
        expect(cancel).toMatch(/отмен/i);
        expect(cancel).toMatch(/не создава/i);
    });

    it('never creates a second task after a successful create_task for the same card', () => {
        const again = section(/^Повторное/);

        expect(again).toContain('create_task');
        expect(again).toMatch(/повторно|второй раз|дубл/i);
    });

    it('converts relative dates and defaults the time to 18:00 MSK', () => {
        const dates = section(/^Даты/);

        expect(dates).toMatch(/Сейчас/);
        expect(dates).toMatch(/18:00/);
        expect(dates).toMatch(/пятниц/i);
        expect(dates).toMatch(/\+03:00/);
    });

    it('reports the result and never claims success on a rejected create', () => {
        const result = section(/^Результат/);

        expect(result).toMatch(/не сообщай, что задача создана/i);
    });
});
