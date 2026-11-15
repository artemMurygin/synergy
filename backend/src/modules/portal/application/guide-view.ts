import type { GuideRecord } from '../domain/ports/agent-guide-query.port';

export interface GuidePerson {
    id: string;
    login: string;
    fullName: string;
}

/** Инструкция агента для API; у агента без инструкции все поля `null`. */
export interface GuideView {
    body: string | null;
    updatedAt: Date | null;
    updatedBy: GuidePerson | null;
}

export const EMPTY_GUIDE: GuideView = { body: null, updatedAt: null, updatedBy: null };

export function toGuideView(record: GuideRecord | null): GuideView {
    if (record === null) return { ...EMPTY_GUIDE };
    return { body: record.body, updatedAt: record.updatedAt, updatedBy: { ...record.updatedBy } };
}
