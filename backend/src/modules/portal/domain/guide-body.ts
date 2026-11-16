import { ArgumentInvalidError } from '../../../shared/errors';

export const MAX_GUIDE_LENGTH = 50000;

/** Текст инструкции: trim по краям, 1-50 000 символов; разметка и внутренние пустые строки сохраняются. */
export class GuideBody {
    private constructor(readonly value: string) {}

    /** Пусто после trim → `null` (инструкция удаляется); длиннее лимита → `ArgumentInvalidError`. */
    static of(raw: string): GuideBody | null {
        const value = raw.trim();
        if (value.length === 0) return null;
        if (value.length > MAX_GUIDE_LENGTH) {
            throw new ArgumentInvalidError(
                `Guide body is longer than ${String(MAX_GUIDE_LENGTH)} characters`,
            );
        }
        return new GuideBody(value);
    }
}
