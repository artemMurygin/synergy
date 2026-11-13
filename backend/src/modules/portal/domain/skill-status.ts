import { ArgumentInvalidError } from '../../../shared/errors';

export const SKILL_STATUSES = ['planned', 'in_dev', 'testing', 'launched'] as const;

export type SkillStatus = (typeof SKILL_STATUSES)[number];

export class InvalidSkillStatusError extends ArgumentInvalidError {}

export const SkillStatus = {
    parse(raw: string): SkillStatus {
        const status = SKILL_STATUSES.find((candidate) => candidate === raw);
        if (status === undefined) {
            throw new InvalidSkillStatusError(`Unknown skill status: ${raw}`);
        }
        return status;
    },

    /** Соседний статус вперёд или `null` для `launched`. */
    next(status: SkillStatus): SkillStatus | null {
        return SKILL_STATUSES[SKILL_STATUSES.indexOf(status) + 1] ?? null;
    },

    /** Единственное место правила переходов: только соседний вперёд. */
    canAdvanceTo(from: SkillStatus, to: SkillStatus): boolean {
        return SkillStatus.next(from) === to;
    },
};
