import type { Skill } from '../skill';
import type { SkillStatus } from '../skill-status';

export abstract class SkillRepository {
    abstract findById(id: string): Promise<Skill | null>;
    /** `SELECT … FOR UPDATE`: второй параллельный писатель ждёт конца транзакции. */
    abstract findForUpdate(id: string): Promise<Skill | null>;
    /**
     * Без `expectedStatus` вставляет новый навык. С `expectedStatus` обновляет условно
     * (`WHERE status = expectedStatus`): 0 строк → `InvalidSkillTransitionError` (конфликт).
     */
    abstract save(skill: Skill, expectedStatus?: SkillStatus): Promise<void>;
}
