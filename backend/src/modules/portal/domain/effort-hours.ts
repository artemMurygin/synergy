import { ArgumentInvalidError } from '../../../shared/errors';

export const MAX_EFFORT_HOURS = 2000;

/** Оценка трудозатрат, ч: целое 1..2000. */
export class EffortHours {
    private constructor(readonly value: number) {}

    static of(value: number): EffortHours {
        if (!Number.isInteger(value) || value < 1 || value > MAX_EFFORT_HOURS) {
            throw new ArgumentInvalidError(
                `Effort must be an integer from 1 to ${String(MAX_EFFORT_HOURS)} hours`,
            );
        }
        return new EffortHours(value);
    }
}
