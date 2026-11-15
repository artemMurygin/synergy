import type { SkillStatus } from '../skill-status';
import type { ProductRef } from './catalog-query.port';
import type { Page, PageRequest } from './page';

/** Read-модель навыка с агентом, продуктом и числом привязанных заявок. */
export interface SkillView {
    id: string;
    name: string;
    description: string;
    status: SkillStatus;
    agent: { id: string; name: string };
    /** Продукты агента, по slug. */
    products: ProductRef[];
    linkedRequestCount: number;
    createdAt: Date;
    statusChangedAt: Date;
    launchedAt: Date | null;
    archivedAt: Date | null;
}

export abstract class SkillQuery {
    /** Видимые навыки (без архивных и навыков архивных агентов) с фильтром по статусу, последние смены статуса первыми. */
    abstract list(filter: { status?: SkillStatus }, page: PageRequest): Promise<Page<SkillView>>;
    /** По id, включая архивный навык и навык архивного агента (ответ archive/restore). */
    abstract findView(id: string): Promise<SkillView | null>;
}
