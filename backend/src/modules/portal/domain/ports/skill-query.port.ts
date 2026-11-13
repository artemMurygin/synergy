import type { SkillStatus } from '../skill-status';
import type { Page, PageRequest } from './page';

/** Read-модель навыка с агентом, продуктом и числом привязанных заявок. */
export interface SkillView {
    id: string;
    name: string;
    description: string;
    status: SkillStatus;
    agent: { id: string; name: string };
    product: { id: string; name: string };
    linkedRequestCount: number;
    createdAt: Date;
    statusChangedAt: Date;
}

export abstract class SkillQuery {
    /** Список навыков с необязательным фильтром по статусу, последние смены статуса первыми. */
    abstract list(filter: { status?: SkillStatus }, page: PageRequest): Promise<Page<SkillView>>;
    abstract findView(id: string): Promise<SkillView | null>;
}
