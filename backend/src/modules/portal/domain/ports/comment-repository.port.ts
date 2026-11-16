import type { RequestComment } from '../request-comment';

export abstract class CommentRepository {
    abstract insert(comment: RequestComment): Promise<void>;
    /** Некорректный UUID и неизвестный id дают `null`. */
    abstract findById(id: string): Promise<RequestComment | null>;
    /** Пишет `body` и `edited_at`; остальные поля неизменны. */
    abstract update(comment: RequestComment): Promise<void>;
}
