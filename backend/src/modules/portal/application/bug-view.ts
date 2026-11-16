import { BugStatusPolicy, type BugStatus } from '../domain/bug-status';
import type { BugRecord } from '../domain/ports/bug-query.port';

export type { Page } from '../domain/ports/page';
export type { BugListRecord } from '../domain/ports/bug-query.port';

/** Баг для клиента: read-модель + допустимые следующие статусы (только для developer). */
export interface BugView extends BugRecord {
    nextStatuses: readonly BugStatus[];
}

/** `nextStatuses` считает политика домена; не-разработчику действия недоступны. */
export function toBugView(record: BugRecord, roles: readonly string[]): BugView {
    const isDeveloper = roles.includes('developer');
    return {
        ...record,
        nextStatuses: isDeveloper ? BugStatusPolicy.nextStatuses(record.status) : [],
    };
}
