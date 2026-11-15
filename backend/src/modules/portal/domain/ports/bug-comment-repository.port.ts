import type { BugComment } from '../bug-comment';

export abstract class BugCommentRepository {
    abstract insert(comment: BugComment): Promise<void>;
    /** Некорректный UUID и неизвестный id дают `null`. */
    abstract findById(id: string): Promise<BugComment | null>;
    /** Пишет `body` и `edited_at`; остальные поля неизменны. */
    abstract update(comment: BugComment): Promise<void>;
}
