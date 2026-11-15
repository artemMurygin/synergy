import { ArgumentInvalidError } from '../../../shared/errors';

export const SKILL_STATUSES = ['planned', 'in_dev', 'testing', 'launched', 'rework'] as const;

export type SkillStatus = (typeof SKILL_STATUSES)[number];

/** Допустимые переходы: planned→in_dev→testing→(launched|rework), launched→rework, rework→testing. */
const SKILL_TRANSITIONS: Readonly<Record<SkillStatus, readonly SkillStatus[]>> = {
    planned: ['in_dev'],
    in_dev: ['testing'],
    testing: ['launched', 'rework'],
    launched: ['rework'],
    rework: ['testing'],
};

export class InvalidSkillStatusError extends ArgumentInvalidError {}

export const SkillStatus = {
    parse(raw: string): SkillStatus {
        const status = SKILL_STATUSES.find((candidate) => candidate === raw);
        if (status === undefined) {
            throw new InvalidSkillStatusError(`Unknown skill status: ${raw}`);
        }
        return status;
    },

    /** Допустимые следующие статусы (порядок из таблицы переходов). */
    allowedNext(status: SkillStatus): readonly SkillStatus[] {
        return SKILL_TRANSITIONS[status];
    },

    /** Единственное место правила переходов: таблица `SKILL_TRANSITIONS`. */
    canMove(from: SkillStatus, to: SkillStatus): boolean {
        return SKILL_TRANSITIONS[from].includes(to);
    },
};
