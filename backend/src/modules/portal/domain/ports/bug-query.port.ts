import type { BugStatus } from '../bug-status';
import type { Page, PageRequest } from './page';

export interface BugPerson {
    id: string;
    login: string;
    /** ФИО по правилам employee-directory, без ФИО — логин. */
    fullName: string;
}

/** Read-модель бага для списков. */
export interface BugListRecord {
    id: string;
    title: string;
    product: { id: string; name: string };
    agent: { id: string; name: string };
    status: BugStatus;
    createdAt: Date;
    statusChangedAt: Date;
    author: BugPerson;
}

/** Read-модель бага для карточки. */
export interface BugRecord extends BugListRecord {
    description: string;
    statusChangedBy: BugPerson | null;
    wontFixReason: string | null;
}

export abstract class BugQuery {
    /** Невалидный UUID — `null`. */
    abstract findView(id: string): Promise<BugRecord | null>;
    /** Только свои баги, новые первыми. */
    abstract listByAuthor(authorId: string, page: PageRequest): Promise<Page<BugListRecord>>;
    /**
     * Очередь разработчика. Без статуса — `open` и `in_progress` (старые первыми, `open` выше);
     * `resolved`/`wont_fix` — по `status_changed_at DESC`.
     */
    abstract listQueue(status: BugStatus | null, page: PageRequest): Promise<Page<BugListRecord>>;
}
