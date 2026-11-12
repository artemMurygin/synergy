import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
import type { RawExtractedTask } from '../../domain/extracted-meeting-task';
import { formatMoscowDate } from '../../domain/meeting-time-format';
import {
    TaskExtractorPort,
    type TaskExtractionContext,
} from '../../domain/ports/task-extractor.port';

const taskSchema = z.object({
    title: z.string().describe('Короткое название задачи в повелительном наклонении'),
    description: z
        .string()
        .describe('Что именно нужно сделать, только по сказанному на встрече; может быть пустым'),
    assigneeMention: z
        .string()
        .nullable()
        .describe(
            'Исполнитель так, как он назван в речи (имя спикера или упоминание); null, если не прозвучал',
        ),
    dueText: z
        .string()
        .nullable()
        .describe('Срок дословно, как прозвучал («до пятницы», «20 ноября»); null, если не назван'),
    evidence: z.object({
        seq: z.number().int().describe('Номер реплики в квадратных скобках в начале строки'),
        quote: z
            .string()
            .describe('Дословная цитата из текста этой реплики, без изменений, 3–25 слов'),
    }),
});

const tasksSchema = z.object({
    tasks: z.array(taskSchema).describe('Задачи встречи; пустой список, если задач нет'),
});

type TasksOutput = z.infer<typeof tasksSchema>;

export const EXTRACT_SYSTEM_PROMPT = `Ты извлекаешь задачи из расшифровки рабочей встречи.

Задача — это поручение или договорённость о конкретном действии, которое кто-то должен выполнить после встречи.
Не считай задачами мнения, обсуждения, вопросы без договорённости, уже сделанное и общие пожелания.

Правила:
- Никогда не придумывай задачи, исполнителей и сроки, которых нет в речи. Сомневаешься — не включай.
- У каждой задачи обязательно основание: номер реплики (число в квадратных скобках в начале строки) и дословная цитата из текста этой реплики, без перефразирования и исправлений.
- Исполнитель — только если он назван в речи или сам взял задачу («я сделаю»: тогда это говорящий). Иначе null.
- Срок — только если он прозвучал; передай его дословно. Иначе null.
- Одна и та же задача — один раз.
- Если задач нет, верни пустой список.
- Пиши по-русски.`;

export const MERGE_SYSTEM_PROMPT = `Тебе даны списки задач, извлечённые из перекрывающихся фрагментов одной встречи.
Объедини их в один список:
- одна и та же задача, найденная в нескольких фрагментах, остаётся один раз, формулировки объединяются;
- основание (evidence.seq и evidence.quote) бери без изменений из одной из исходных задач;
- не добавляй задач, исполнителей и сроков, которых нет во входных списках;
- порядок — по номеру реплики основания.`;

/**
 * Структурированный вывод модели (zod), температура 0 — задаётся при создании модели.
 * Модель создаётся при первом вызове: без ключа OpenRouter модуль поднимается, а падает
 * только извлечение задач.
 */
export class TaskExtractor extends TaskExtractorPort {
    private model: BaseChatModel | null = null;

    constructor(private readonly createModel: () => BaseChatModel) {
        super();
    }

    async extract(
        lines: readonly string[],
        context: TaskExtractionContext,
    ): Promise<RawExtractedTask[]> {
        if (lines.length === 0) return [];
        const human = [
            `Дата встречи: ${formatMoscowDate(context.meetingDate)}`,
            `Участники: ${context.participants.join(', ')}`,
            '',
            'Реплики в формате «[номер] [чч:мм:сс] Имя: текст»:',
            ...lines,
        ].join('\n');
        return this.ask([new SystemMessage(EXTRACT_SYSTEM_PROMPT), new HumanMessage(human)]);
    }

    async merge(batches: readonly (readonly RawExtractedTask[])[]): Promise<RawExtractedTask[]> {
        const nonEmpty = batches.filter((b) => b.length > 0);
        if (nonEmpty.length === 0) return [];
        if (nonEmpty.length === 1) return [...(nonEmpty[0] ?? [])];
        const human = nonEmpty
            .map((batch, i) => `Фрагмент ${String(i + 1)}:\n${JSON.stringify(batch)}`)
            .join('\n\n');
        return this.ask([new SystemMessage(MERGE_SYSTEM_PROMPT), new HumanMessage(human)]);
    }

    private async ask(messages: BaseMessage[]): Promise<RawExtractedTask[]> {
        this.model ??= this.createModel();
        const structured = this.model.withStructuredOutput<TasksOutput>(tasksSchema, {
            name: 'meeting_tasks',
            method: 'functionCalling',
        });
        const output = tasksSchema.parse(await structured.invoke(messages));
        return output.tasks.map((t) => ({
            title: t.title,
            description: t.description,
            assigneeMention: t.assigneeMention,
            dueText: t.dueText,
            evidence: { seq: t.evidence.seq, quote: t.evidence.quote },
        }));
    }
}
