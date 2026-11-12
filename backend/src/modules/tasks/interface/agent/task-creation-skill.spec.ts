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
        expect(confirm).toContain('create_tasks');
        expect(confirm).toMatch(/другую тему|не ответил/i);
        expect(confirm).toMatch(/всего списка|весь список/i);
    });

    it('turns an edit into a new card and a cancel into no task', () => {
        expect(section(/^Правка/)).toMatch(/нов(ую|ая) карточк/i);
        const cancel = section(/^Отмена/);
        expect(cancel).toMatch(/отмен/i);
        expect(cancel).toMatch(/не создава/i);
    });

    it('never creates the tasks again after a successful create_tasks for the same list', () => {
        const again = section(/^Повторное/);

        expect(again).toContain('create_tasks');
        expect(again).toMatch(/повторно|второй раз|дубл/i);
        expect(again).toMatch(/уже создан/i);
    });

    it('creates through propose_tasks and create_tasks only, a single task included', () => {
        const text = body();

        expect(text).toContain('propose_tasks');
        expect(text).toContain('create_tasks');
        expect(text).not.toMatch(/\bcreate_task\b/);
        expect(text).toMatch(/одн(а|у) задач[^.]*тем же|тем же[^.]*одн(а|у) задач/i);
    });

    it('describes the list: numbered cards, one message for missing fields, limit of 30', () => {
        const list = section(/^Список задач/);

        expect(list).toMatch(/номер/i);
        expect(list).toMatch(/одним сообщением/i);
        expect(list).toMatch(/30/);
        expect(list).toMatch(/разб/i);
        expect(list).toMatch(/спикер/i);
    });

    it('lets the user fix or exclude a task by its number and asks to confirm the new list', () => {
        const edit = section(/^Правка/);

        expect(edit).toMatch(/по номеру/i);
        expect(edit).toMatch(/исключ|убер|не надо/i);
        expect(edit).toMatch(/propose_tasks/);
        expect(edit).toMatch(/снова|заново|нов(ый|ое)/i);
    });

    it('lets the user name another creator, marked «от имени» on the card', () => {
        const creator = section(/^Постановщик/);

        expect(creator).toMatch(/find_users/);
        expect(creator).toMatch(/от имени/i);
        expect(creator).toMatch(/не назван|по умолчанию|сам пользователь/i);
        expect(creator).toMatch(/несколько/i);
        expect(section(/^Карточка/)).toMatch(/Постановщик:/);
    });

    it('never creates without an explicit confirmation of the shown list', () => {
        const text = body();

        expect(text).toMatch(/без явного подтверждения/i);
    });

    it('passes the meeting origin and reports the tasks document for a meeting list', () => {
        const meeting = section(/^Список из встречи/);

        expect(meeting).toMatch(/origin/);
        expect(meeting).toMatch(/Поставленные задачи/);
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
        expect(result).toMatch(/по каждой задаче/i);
        expect(result).toMatch(/постановщик/i);
    });
});
