/** Москва живёт по UTC+3 без перехода на летнее время. */
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;
const DEFAULT_HOUR = 18;
const DAY_MS = 24 * 60 * 60 * 1000;

interface LocalDay {
    readonly year: number;
    /** 0..11 */
    readonly month: number;
    readonly day: number;
}

interface TimeOfDay {
    readonly hour: number;
    readonly minute: number;
}

/** Основы названий дней недели → номер дня (`Date.getUTCDay`). */
const WEEKDAYS: readonly [RegExp, number][] = [
    [/понедельник/u, 1],
    [/вторник/u, 2],
    [/сред[ауые]/u, 3],
    [/четверг/u, 4],
    [/пятниц/u, 5],
    [/суббот/u, 6],
    [/воскресень/u, 0],
];

const MONTHS: readonly [RegExp, number][] = [
    [/^январ/u, 0],
    [/^феврал/u, 1],
    [/^март/u, 2],
    [/^апрел/u, 3],
    [/^ма[яй]/u, 4],
    [/^июн/u, 5],
    [/^июл/u, 6],
    [/^август/u, 7],
    [/^сентябр/u, 8],
    [/^октябр/u, 9],
    [/^ноябр/u, 10],
    [/^декабр/u, 11],
];

const NUMBER_WORDS: Readonly<Record<string, number>> = {
    один: 1,
    одну: 1,
    одна: 1,
    два: 2,
    две: 2,
    три: 3,
    четыре: 4,
    пять: 5,
    шесть: 6,
    семь: 7,
    восемь: 8,
    девять: 9,
    десять: 10,
};

/**
 * Срок из речи → момент времени, по правилам относительных дат задач: часовой пояс Москвы,
 * без названного времени — 18:00. Считается от даты встречи (загрузки записи), а не от
 * сегодняшней. Непонятный срок даёт `null`: лучше пустой срок, чем выдуманный.
 */
export const MeetingDueDateResolver = {
    resolve(dueText: string | null, meetingDate: Date): Date | null {
        const text = (dueText ?? '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
        if (text.length === 0) return null;
        const base = moscowDay(meetingDate);
        const day = resolveDay(text, base);
        if (day === null) return null;
        const time = resolveTime(text) ?? { hour: DEFAULT_HOUR, minute: 0 };
        return fromMoscow(day, time);
    },
};

function resolveDay(text: string, base: LocalDay): LocalDay | null {
    if (text.includes('послезавтра')) return addDays(base, 2);
    if (text.includes('завтра')) return addDays(base, 1);
    if (text.includes('сегодня')) return base;
    if (/конц[аеу]? недел/u.test(text)) return nextWeekday(base, 5, true);
    if (/конц[аеу]? месяц/u.test(text)) return lastDayOfMonth(base);

    const numeric = /\b(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\b/u.exec(text);
    if (numeric !== null) {
        const year = numeric.at(3);
        return explicitDate(
            base,
            Number(numeric[1]),
            Number(numeric[2]) - 1,
            year === undefined ? null : Number(year),
        );
    }
    const verbal = /\b(\d{1,2}) ([а-я]+)(?: (\d{4}))?/u.exec(text);
    if (verbal !== null) {
        const monthWord = verbal[2];
        const year = verbal.at(3);
        const month = MONTHS.find(([re]) => re.test(monthWord))?.[1];
        if (month !== undefined) {
            return explicitDate(
                base,
                Number(verbal[1]),
                month,
                year === undefined ? null : Number(year),
            );
        }
    }

    const after = /через (?:(\d+|[а-я]+) )?(дн|день|недел|месяц)/u.exec(text);
    if (after !== null) {
        const rawCount = after.at(1);
        const unit = after[2];
        const count = rawCount === undefined ? 1 : toNumber(rawCount);
        if (count === null) return null;
        if (unit === 'месяц') return addMonths(base, count);
        return addDays(base, unit === 'недел' ? count * 7 : count);
    }

    const weekday = WEEKDAYS.find(([re]) => re.test(text))?.[1];
    if (weekday !== undefined) return nextWeekday(base, weekday, false);
    return null;
}

/** «в 15:00», «к 12:30», «в 10 часов», «к 9 утра», «до 5 вечера». */
function resolveTime(text: string): TimeOfDay | null {
    const clock = /(?:^|\s)(\d{1,2}):(\d{2})(?!\d)/u.exec(text);
    if (clock !== null) {
        const hour = Number(clock[1]);
        const minute = Number(clock[2]);
        if (hour < 24 && minute < 60) return { hour, minute };
    }
    const hours = /(?:^|\s)(?:в|к|до) (\d{1,2}) (час|утра|вечера|дня)/u.exec(text);
    if (hours !== null) {
        let hour = Number(hours[1]);
        if ((hours[2] === 'вечера' || hours[2] === 'дня') && hour < 12) hour += 12;
        if (hour < 24) return { hour, minute: 0 };
    }
    return null;
}

function toNumber(raw: string): number | null {
    if (/^\d+$/u.test(raw)) return Number(raw);
    return NUMBER_WORDS[raw] ?? null;
}

function explicitDate(
    base: LocalDay,
    day: number,
    month: number,
    year: number | null,
): LocalDay | null {
    const candidate = (y: number): LocalDay | null => {
        const date = new Date(Date.UTC(y, month, day));
        return date.getUTCMonth() === month && date.getUTCDate() === day
            ? { year: y, month, day }
            : null;
    };
    if (year !== null) return candidate(year);
    const thisYear = candidate(base.year);
    if (thisYear === null) return null;
    // Дата без года, которая уже прошла к встрече, относится к следующему году.
    return toEpochDay(thisYear) < toEpochDay(base) ? candidate(base.year + 1) : thisYear;
}

/** Ближайший такой день после даты встречи; `allowSame` — сам день встречи подходит. */
function nextWeekday(base: LocalDay, weekday: number, allowSame: boolean): LocalDay {
    const current = new Date(Date.UTC(base.year, base.month, base.day)).getUTCDay();
    let delta = (weekday - current + 7) % 7;
    if (delta === 0 && !allowSame) delta = 7;
    return addDays(base, delta);
}

function lastDayOfMonth(base: LocalDay): LocalDay {
    const date = new Date(Date.UTC(base.year, base.month + 1, 0));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
}

function addDays(base: LocalDay, days: number): LocalDay {
    const date = new Date(Date.UTC(base.year, base.month, base.day) + days * DAY_MS);
    return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
}

function addMonths(base: LocalDay, months: number): LocalDay {
    const last = new Date(Date.UTC(base.year, base.month + months + 1, 0)).getUTCDate();
    const date = new Date(Date.UTC(base.year, base.month + months, Math.min(base.day, last)));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
}

function toEpochDay(day: LocalDay): number {
    return Date.UTC(day.year, day.month, day.day);
}

function moscowDay(moment: Date): LocalDay {
    const local = new Date(moment.getTime() + MOSCOW_OFFSET_MS);
    return { year: local.getUTCFullYear(), month: local.getUTCMonth(), day: local.getUTCDate() };
}

function fromMoscow(day: LocalDay, time: TimeOfDay): Date {
    return new Date(
        Date.UTC(day.year, day.month, day.day, time.hour, time.minute) - MOSCOW_OFFSET_MS,
    );
}
