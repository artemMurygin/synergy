import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { ArgumentInvalidError } from '../../../shared/errors';
import type { Actor } from '../domain/actor';
import { DraftOrigin } from '../domain/draft-origin';
import { DraftTaskItem } from '../domain/draft-task-item';
import { Clock } from '../domain/ports/clock.port';
import { MeetingRecordingsPort } from '../domain/ports/meeting-recordings.port';
import { TaskBatchDraftRepositoryPort } from '../domain/ports/task-batch-draft-repository.port';
import { UserDirectory } from '../domain/ports/user-directory.port';
import { TaskBatchDraft } from '../domain/task-batch-draft';
import {
    InvalidDraftItemError,
    MeetingRecordingNotFoundError,
    UnknownDraftUserError,
    assertBatchSize,
} from '../domain/task-batch-errors';
import type { TaskUserRef } from './task-view';

export interface ProposedItemInput {
    title: string;
    description?: string;
    deadline?: Date | null;
    assigneeId?: string | null;
    /** Постановщик; по умолчанию — собеседник агента (`actor`). */
    creatorId?: string;
    watcherIds?: readonly string[];
    sourceNote?: string | null;
}

export interface ProposeTasksInput {
    /** Thread агента (id чата): в нём актуален один черновик. */
    threadId: string;
    items: readonly ProposedItemInput[];
    meetingFileId?: string | null;
}

/** Карточка задачи черновика для показа пользователю. */
export interface DraftCardView {
    /** Номер задачи в списке, с 1: по нему пользователь правит и исключает задачи. */
    number: number;
    title: string;
    description: string;
    deadline: Date | null;
    assignee: TaskUserRef | null;
    creator: TaskUserRef;
    /** Постановщик не собеседник: карточка показывает пометку «от имени». */
    onBehalf: boolean;
    watchers: TaskUserRef[];
    sourceNote: string | null;
}

export interface ProposeTasksResult {
    draftId: string;
    cards: DraftCardView[];
}

/**
 * Сохраняет согласуемый список задач как черновик. Любой новый список в thread заменяет прежний
 * черновик, даже если сам не прошёл проверку: подтвердить можно только последний показанный.
 */
@Injectable()
export class ProposeTasksUseCase {
    constructor(
        private readonly drafts: TaskBatchDraftRepositoryPort,
        private readonly users: UserDirectory,
        private readonly recordings: MeetingRecordingsPort,
        private readonly clock: Clock,
        private readonly transactions: TransactionRunnerPort,
    ) {}

    async execute(actor: Actor, input: ProposeTasksInput): Promise<ProposeTasksResult> {
        let draft: TaskBatchDraft;
        let logins: Map<string, string>;
        try {
            assertBatchSize(input.items.length);
            const items = input.items.map((item, i) => toDraftItem(actor, item, i + 1));
            const [resolvedLogins, origin] = await Promise.all([
                this.resolveUsers(items),
                this.resolveOrigin(actor, input.meetingFileId ?? null),
            ]);
            logins = resolvedLogins;
            draft = TaskBatchDraft.create({
                id: randomUUID(),
                ownerId: actor.userId,
                threadId: input.threadId,
                items,
                origin,
                now: this.clock.now(),
            });
        } catch (error: unknown) {
            await this.drafts.supersedeActive(input.threadId, actor.userId);
            throw error;
        }
        await this.transactions.run(async () => {
            await this.drafts.supersedeActive(input.threadId, actor.userId);
            await this.drafts.save(draft);
        });
        const ref = (id: string): TaskUserRef => ({ id, login: logins.get(id) ?? null });
        return {
            draftId: draft.id,
            cards: draft.items.map((item, i) => ({
                number: i + 1,
                title: item.title.value,
                description: item.description,
                deadline: item.deadline,
                assignee: item.assigneeId === null ? null : ref(item.assigneeId),
                creator: ref(item.creatorId),
                onBehalf: item.creatorId !== actor.userId,
                watchers: item.watcherIds.map(ref),
                sourceNote: item.sourceNote,
            })),
        };
    }

    private async resolveOrigin(
        actor: Actor,
        meetingFileId: string | null,
    ): Promise<DraftOrigin | null> {
        if (meetingFileId === null) return null;
        const recordingName = await this.recordings.findOwnedRecordingName(
            actor.userId,
            meetingFileId,
        );
        if (recordingName === null) throw new MeetingRecordingNotFoundError(meetingFileId);
        return DraftOrigin.meeting({ fileId: meetingFileId, recordingName });
    }

    private async resolveUsers(items: readonly DraftTaskItem[]): Promise<Map<string, string>> {
        const ids = new Set<string>();
        for (const item of items) {
            ids.add(item.creatorId);
            if (item.assigneeId !== null) ids.add(item.assigneeId);
            for (const id of item.watcherIds) ids.add(id);
        }
        const logins = new Map<string, string>();
        for (const user of await this.users.findActiveByIds([...ids])) {
            logins.set(user.id, user.login);
        }
        items.forEach((item, i) => {
            const index = i + 1;
            if (item.assigneeId !== null && !logins.has(item.assigneeId)) {
                throw new UnknownDraftUserError(index, 'assignee', item.assigneeId);
            }
            if (!logins.has(item.creatorId)) {
                throw new UnknownDraftUserError(index, 'creator', item.creatorId);
            }
            const watcher = item.watcherIds.find((id) => !logins.has(id));
            if (watcher !== undefined) throw new UnknownDraftUserError(index, 'watcher', watcher);
        });
        return logins;
    }
}

function toDraftItem(actor: Actor, item: ProposedItemInput, index: number): DraftTaskItem {
    try {
        return DraftTaskItem.of({ ...item, creatorId: item.creatorId ?? actor.userId });
    } catch (error: unknown) {
        if (error instanceof ArgumentInvalidError) {
            throw new InvalidDraftItemError(index, error.message);
        }
        throw error;
    }
}
