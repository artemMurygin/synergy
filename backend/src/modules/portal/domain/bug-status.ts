export const BUG_STATUSES = ['open', 'in_progress', 'resolved', 'wont_fix'] as const;

export type BugStatus = (typeof BUG_STATUSES)[number];

/** Единственный источник допустимых переходов статуса бага. */
export const BUG_TRANSITIONS: Readonly<Record<BugStatus, readonly BugStatus[]>> = {
    open: ['in_progress', 'wont_fix'],
    in_progress: ['resolved', 'wont_fix', 'open'],
    resolved: ['in_progress'],
    wont_fix: ['in_progress'],
};

export const BugStatusPolicy = {
    nextStatuses(from: BugStatus): readonly BugStatus[] {
        return BUG_TRANSITIONS[from];
    },
    canTransition(from: BugStatus, to: BugStatus): boolean {
        return BUG_TRANSITIONS[from].includes(to);
    },
} as const;
