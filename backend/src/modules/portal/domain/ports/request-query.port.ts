import type { RequestStatus } from '../request-status-policy';
import type { FrequencyPeriod } from '../frequency';
import type { Page, PageRequest } from './page';

/** Read-модель заявки: читается через JOIN, статус для автора выводится политикой. */
export interface RequestView {
    id: string;
    authorId: string;
    authorLogin: string;
    title: string;
    description: string;
    frequency: { count: number; period: FrequencyPeriod };
    minutesPerRun: number;
    peopleCount: number;
    status: RequestStatus;
    rejectReason: string | null;
    skill: { id: string; name: string; description: string } | null;
    createdAt: Date;
}

export abstract class RequestQuery {
    /** Только свои заявки, новые первыми. */
    abstract listByAuthor(authorId: string, page: PageRequest): Promise<Page<RequestView>>;
    /** Очередь: только `pending`, старые первыми. */
    abstract listPending(page: PageRequest): Promise<Page<RequestView>>;
    abstract findView(id: string): Promise<RequestView | null>;
}
