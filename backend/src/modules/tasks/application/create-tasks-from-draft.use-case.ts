import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { StoredFileView } from '../../files/application/stored-file-view';
import { ArgumentInvalidError } from '../../../shared/errors';
import type { Actor } from '../domain/actor';
import type { DraftTaskItem } from '../domain/draft-task-item';
import { TaskUserNotFoundError } from '../domain/errors';
import { TaskBatchDraftRepositoryPort } from '../domain/ports/task-batch-draft-repository.port';
import { UserDirectory } from '../domain/ports/user-directory.port';
import { DraftAlreadyUsedError, DraftNotFoundError } from '../domain/task-batch-errors';
import { TaskBatchResult, type TaskBatchResultItem } from '../domain/task-batch-result';
import { TaskAccessDeniedError } from '../domain/access-denied.error';
import { CreateTaskUseCase } from './create-task.use-case';
import type { TaskUserRef } from './task-view';
import { TasksReportDocument } from './tasks-report-document';

export interface CreateTasksFromDraftInput {
    draftId: string;
}

export interface DraftTaskOutcomeView {
    outcome: TaskBatchResultItem;
    title: string;
    assignee: TaskUserRef | null;
    creator: TaskUserRef;
    deadline: Date | null;
}

export interface CreateTasksFromDraftResult {
    result: TaskBatchResult;
    tasks: DraftTaskOutcomeView[];
    report: StoredFileView | null;
}

@Injectable()
export class CreateTasksFromDraftUseCase {
    constructor(
        private readonly drafts: TaskBatchDraftRepositoryPort,
        private readonly createTask: CreateTaskUseCase,
        private readonly users: UserDirectory,
        private readonly reportDocument: TasksReportDocument,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(CreateTasksFromDraftUseCase.name);
    }

    async execute(
        actor: Actor,
        input: CreateTasksFromDraftInput,
    ): Promise<CreateTasksFromDraftResult> {
        const draft = await this.drafts.findById(input.draftId, actor.userId);
        if (draft === null) throw new DraftNotFoundError(input.draftId);
        const items = draft.consume();
        if (!(await this.drafts.consume(draft.id, actor.userId))) {
            throw new DraftAlreadyUsedError(draft.id, 'consumed');
        }

        const outcomes: TaskBatchResultItem[] = [];
        for (const [i, item] of items.entries()) {
            outcomes.push(await this.createOne(actor, draft.id, item, i + 1));
        }
        const result = TaskBatchResult.of(outcomes);
        draft.recordResult(result);
        await this.drafts.saveResult(draft.id, result);

        const [tasks, report] = await Promise.all([
            this.describe(draft.id, result, items),
            draft.origin === null
                ? null
                : this.issueReport({
                      ownerId: actor.userId,
                      origin: draft.origin,
                      result,
                      items,
                  }),
        ]);
        return { result, tasks, report };
    }

    private async describe(
        draftId: string,
        result: TaskBatchResult,
        items: readonly DraftTaskItem[],
    ): Promise<DraftTaskOutcomeView[]> {
        const logins = await this.loginsOf(draftId, items);
        const ref = (id: string): TaskUserRef => ({ id, login: logins.get(id) ?? null });
        return result.items.flatMap((outcome) => {
            const item = items.at(outcome.index - 1);
            if (item === undefined) return [];
            return [
                {
                    outcome,
                    title: item.title.value,
                    assignee: item.assigneeId === null ? null : ref(item.assigneeId),
                    creator: ref(item.creatorId),
                    deadline: item.deadline,
                },
            ];
        });
    }

    private async loginsOf(
        draftId: string,
        items: readonly DraftTaskItem[],
    ): Promise<Map<string, string>> {
        const ids = new Set<string>();
        for (const item of items) {
            ids.add(item.creatorId);
            if (item.assigneeId !== null) ids.add(item.assigneeId);
        }
        try {
            const users = await this.users.findByIds([...ids]);
            return new Map(users.map((user) => [user.id, user.login]));
        } catch (error: unknown) {
            // The tasks already exist: the summary falls back to user ids instead of failing.
            this.logger.warn({ draftId, err: error }, 'Failed to look up the users of the summary');
            return new Map();
        }
    }

    private async createOne(
        actor: Actor,
        draftId: string,
        item: DraftTaskItem,
        index: number,
    ): Promise<TaskBatchResultItem> {
        try {
            const task = await this.createTask.execute(actor, {
                title: item.title.value,
                description: item.description,
                deadline: item.deadline,
                assigneeId: item.assigneeId,
                watcherIds: item.watcherIds,
                creatorId: item.creatorId,
            });
            return { index, status: 'created', taskId: task.id };
        } catch (error: unknown) {
            const reason = failureReason(error, item);
            if (reason === null) {
                // Без текста задачи: в лог попадают только идентификаторы.
                this.logger.error({ draftId, index, err: error }, 'Failed to create a draft task');
            }
            return { index, status: 'failed', reason: reason ?? 'внутренняя ошибка' };
        }
    }

    private async issueReport(
        input: Parameters<TasksReportDocument['issue']>[0],
    ): Promise<StoredFileView | null> {
        try {
            return await this.reportDocument.issue(input);
        } catch (error: unknown) {
            this.logger.error(
                { fileId: input.origin.fileId, err: error },
                'Failed to issue the tasks report document',
            );
            return null;
        }
    }
}

function failureReason(error: unknown, item: DraftTaskItem): string | null {
    if (error instanceof TaskUserNotFoundError) {
        const missing = new Set(error.userIds);
        if (item.assigneeId !== null && missing.has(item.assigneeId)) {
            return 'исполнитель отключён или удалён';
        }
        if (missing.has(item.creatorId)) return 'постановщик отключён или удалён';
        return 'наблюдатель отключён или удалён';
    }
    if (error instanceof TaskAccessDeniedError) return 'нет прав на создание задачи';
    if (error instanceof ArgumentInvalidError) return 'некорректные данные задачи';
    return null;
}
