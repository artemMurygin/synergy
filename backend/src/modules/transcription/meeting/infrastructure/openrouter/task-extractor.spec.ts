import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';
import { EXTRACT_SYSTEM_PROMPT, TaskExtractor, MERGE_SYSTEM_PROMPT } from './task-extractor';

interface Call {
    options: unknown;
    messages: BaseMessage[];
}

/** Модель-двойник: отдаёт заданные ответы по очереди и запоминает вызовы. */
function fakeModel(answers: unknown[]): { model: BaseChatModel; calls: Call[] } {
    const calls: Call[] = [];
    const model = {
        withStructuredOutput: (_schema: unknown, options: unknown) => ({
            invoke: (messages: BaseMessage[]) => {
                calls.push({ options, messages });
                return Promise.resolve(answers.shift());
            },
        }),
    } as unknown as BaseChatModel;
    return { model, calls };
}

const TASK = {
    title: 'Подготовить смету',
    description: '',
    assigneeMention: 'Олег',
    dueText: 'до пятницы',
    evidence: { seq: 0, quote: 'подготовь смету' },
};

describe('TaskExtractor', () => {
    it('sends numbered lines with the meeting date and participants and maps the answer', async () => {
        const { model, calls } = fakeModel([{ tasks: [TASK] }]);
        const extractor = new TaskExtractor(() => model);

        const tasks = await extractor.extract(['[0] [00:00:00] Анна: Олег, подготовь смету'], {
            participants: ['Анна', 'Олег'],
            meetingDate: new Date('2026-11-10T21:30:00Z'),
        });

        expect(tasks).toEqual([TASK]);
        expect(calls[0].options).toMatchObject({ method: 'functionCalling' });
        const [system, human] = calls[0].messages;
        expect(system.content).toBe(EXTRACT_SYSTEM_PROMPT);
        expect(human.content).toContain('Дата встречи: 11.11.2026');
        expect(human.content).toContain('Участники: Анна, Олег');
        expect(human.content).toContain('[0] [00:00:00] Анна: Олег, подготовь смету');
    });

    it('forbids inventing tasks in the prompt', () => {
        expect(EXTRACT_SYSTEM_PROMPT).toContain('Никогда не придумывай');
        expect(MERGE_SYSTEM_PROMPT).toContain('не добавляй задач');
    });

    it('rejects an answer that does not match the schema', async () => {
        const { model } = fakeModel([{ tasks: [{ title: 'Без основания' }] }]);

        await expect(
            new TaskExtractor(() => model).extract(['[0] [00:00:00] Анна: текст'], {
                participants: ['Анна'],
                meetingDate: new Date(),
            }),
        ).rejects.toThrow();
    });

    it('merges several batches with one call and skips the call for a single batch', async () => {
        const { model, calls } = fakeModel([{ tasks: [TASK] }]);
        const extractor = new TaskExtractor(() => model);

        expect(await extractor.merge([[TASK], []])).toEqual([TASK]);
        expect(calls).toHaveLength(0);

        expect(await extractor.merge([[TASK], [TASK]])).toEqual([TASK]);
        expect(calls).toHaveLength(1);
        expect(calls[0].messages[0].content).toBe(MERGE_SYSTEM_PROMPT);
    });
});
