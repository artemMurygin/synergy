import type { BugStatus } from '../domain/bug-status';

/** Русские названия статусов бага для текстов уведомлений. */
export const BUG_STATUS_LABELS: Readonly<Record<BugStatus, string>> = {
    open: 'Открыт',
    in_progress: 'В работе',
    resolved: 'Исправлен',
    wont_fix: 'Не будет исправлен',
};
