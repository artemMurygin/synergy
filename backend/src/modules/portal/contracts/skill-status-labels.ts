import type { SkillStatus } from '../domain/skill-status';

/** Единый словарь русских названий статусов навыка: для API заявок и текстов уведомлений. */
export const SKILL_STATUS_LABELS: Readonly<Record<SkillStatus, string>> = {
    planned: 'Запланировано',
    in_dev: 'В разработке',
    testing: 'Тестируется',
    launched: 'Запущено',
};
