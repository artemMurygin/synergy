const MOSCOW_TIME_ZONE = 'Europe/Moscow';

const DATE_FORMAT = new Intl.DateTimeFormat('ru-RU', {
    timeZone: MOSCOW_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
});

const TIME_FORMAT = new Intl.DateTimeFormat('ru-RU', {
    timeZone: MOSCOW_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
});

/** Секунды от начала записи → `чч:мм:сс` (дробная часть отбрасывается). */
export function formatTimecode(totalSec: number): string {
    const whole = Math.max(0, Math.floor(totalSec));
    const h = Math.floor(whole / 3600);
    const m = Math.floor((whole % 3600) / 60);
    const s = whole % 60;
    return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Дата по Москве: `дд.мм.гггг`. */
export function formatMoscowDate(date: Date): string {
    return DATE_FORMAT.format(date);
}

/** Дата и время по Москве: `дд.мм.гггг чч:мм`. */
export function formatMoscowDateTime(date: Date): string {
    return `${DATE_FORMAT.format(date)} ${TIME_FORMAT.format(date)}`;
}
