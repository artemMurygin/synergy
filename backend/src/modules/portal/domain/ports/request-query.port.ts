import type { RequestStatus } from '../request-status-policy';
import type { FrequencyPeriod } from '../frequency';
import type { Page, PageRequest } from './page';

/** Read-модель заявки: читается через JOIN, статус для автора выводится политикой. */
export interface RequestView {
    id: string;
    authorId: string;
    authorLogin: string;
    /** Фамилия, имя, отчество автора; без ФИО (или без профиля) равно логину. */
    authorFullName: string;
    title: string;
    description: string;
    frequency: { count: number; period: FrequencyPeriod };
    minutesPerRun: number;
    peopleCount: number;
    status: RequestStatus;
    /** Взявший в работу; ФИО по правилам employee-directory, без ФИО — логин. */
    reviewer: { id: string; login: string; fullName: string } | null;
    takenAt: Date | null;
    /** Оценка в часах; null у не принятых и у принятых до появления оценки. */
    effortHours: number | null;
    rejectReason: string | null;
    skill: { id: string; name: string; description: string } | null;
    createdAt: Date;
}

export abstract class RequestQuery {
    /** Только свои заявки, новые первыми. */
    abstract listByAuthor(authorId: string, page: PageRequest): Promise<Page<RequestView>>;
    /** Очередь: `new` и `under_review`, старые первыми, с общим числом. */
    abstract listPending(page: PageRequest): Promise<Page<RequestView>>;
    abstract findView(id: string): Promise<RequestView | null>;
}
