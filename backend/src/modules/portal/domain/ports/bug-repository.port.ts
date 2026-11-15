import type { BugReport } from '../bug-report';
import type { BugStatus } from '../bug-status';

export abstract class BugRepository {
    abstract insert(bug: BugReport): Promise<void>;
    abstract findById(id: string): Promise<BugReport | null>;
    /**
     * Условное обновление статуса: `WHERE id = $ AND status = expected`.
     * `false` — статус уже изменён (проигранная гонка), строка не тронута.
     */
    abstract updateStatus(bug: BugReport, expected: BugStatus): Promise<boolean>;
}
