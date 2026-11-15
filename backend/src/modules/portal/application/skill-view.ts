import type { SkillView as SkillRow } from '../domain/ports/skill-query.port';
import { SkillStatus } from '../domain/skill-status';

/** Представление навыка для API: строка read-модели + допустимые переходы из текущего статуса. */
export type SkillView = SkillRow & { nextStatuses: SkillStatus[] };

/** Единая функция маппинга для списка навыков, архивации и смены статуса. */
export function toSkillView(row: SkillRow): SkillView {
    return { ...row, nextStatuses: [...SkillStatus.allowedNext(row.status)] };
}
