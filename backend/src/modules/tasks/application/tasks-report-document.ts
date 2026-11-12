import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { DocumentModel, DocumentRendererPort } from '../../../shared/documents';
import type { StoredFileView } from '../../files/application/stored-file-view';
import { DraftOrigin } from '../domain/draft-origin';
import type { DraftTaskItem } from '../domain/draft-task-item';
import { Clock } from '../domain/ports/clock.port';
import { GeneratedDocumentStorePort } from '../domain/ports/generated-document-store.port';
import { UserDirectory } from '../domain/ports/user-directory.port';
import type { TaskBatchResult, TaskBatchResultItem } from '../domain/task-batch-result';

export interface IssueTasksReportInput {
    ownerId: string;
    origin: DraftOrigin;
    result: TaskBatchResult;
    /** Задачи черновика в порядке номеров: `result.items[].index` указывает на них, с 1. */
    items: readonly DraftTaskItem[];
}

const TITLE = 'Поставленные задачи';
const HEADER = ['№', 'Задача', 'Исполнитель', 'Постановщик', 'Срок', 'Результат'] as const;

const moscowDate = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
});

/**
 * Документ «Поставленные задачи» с итогом постановки списка из встречи: строит модель,
 * рендерит её общим генератором и сохраняет файлом владельца. Пользователи показываются
 * логинами системы, а не упоминаниями из речи.
 */
@Injectable()
export class TasksReportDocument {
    constructor(
        private readonly renderer: DocumentRendererPort,
        private readonly store: GeneratedDocumentStorePort,
        private readonly users: UserDirectory,
        private readonly clock: Clock,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(TasksReportDocument.name);
    }

    async issue(input: IssueTasksReportInput): Promise<StoredFileView> {
        const logins = await this.loginsOf(input.items);
        const recording = DraftOrigin.recordingTitle(input.origin);
        const model = DocumentModel.of({
            title: `${TITLE} — ${recording}`,
            blocks: [
                {
                    kind: 'paragraph',
                    text: `Дата постановки: ${moscowDate.format(this.clock.now())}`,
                },
                {
                    kind: 'table',
                    header: HEADER,
                    rows: [...input.result.items]
                        .sort((a, b) => a.index - b.index)
                        .map((outcome) => toRow(outcome, input.items, logins)),
                },
            ],
        });
        const buffer = await this.renderer.render(model);
        const file = await this.store.store({
            ownerId: input.ownerId,
            name: `${TITLE} — ${recording}${this.renderer.extension}`,
            mediaType: this.renderer.mediaType,
            buffer,
        });
        // Без текста задач и имён: только идентификаторы, вид документа и размеры.
        this.logger.info(
            {
                fileId: input.origin.fileId,
                documentKind: 'tasks-report',
                taskCount: input.result.items.length,
                sizeBytes: file.sizeBytes,
            },
            'Tasks report document issued',
        );
        return file;
    }

    private async loginsOf(items: readonly DraftTaskItem[]): Promise<Map<string, string>> {
        const ids = new Set<string>();
        for (const item of items) {
            ids.add(item.creatorId);
            if (item.assigneeId !== null) ids.add(item.assigneeId);
        }
        const logins = new Map<string, string>();
        for (const user of await this.users.findByIds([...ids])) {
            logins.set(user.id, user.login);
        }
        return logins;
    }
}

function toRow(
    outcome: TaskBatchResultItem,
    items: readonly DraftTaskItem[],
    logins: ReadonlyMap<string, string>,
): (string | null)[] {
    const item = items.at(outcome.index - 1);
    const result = outcome.status === 'created' ? 'Создана' : `Не создана: ${outcome.reason}`;
    if (item === undefined) return [String(outcome.index), null, null, null, null, result];
    return [
        String(outcome.index),
        item.title.value,
        item.assigneeId === null ? null : (logins.get(item.assigneeId) ?? null),
        logins.get(item.creatorId) ?? null,
        item.deadline === null ? null : moscowDate.format(item.deadline),
        result,
    ];
}
