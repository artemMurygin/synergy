export const MAX_SLUG_LENGTH = 64;
/** Основа slug короче предела, чтобы осталось место под суффикс `-n`. */
const MAX_SLUG_BASE_LENGTH = 60;

/** Упрощённый ГОСТ 7.79-2000 (система Б). */
const TRANSLIT: Readonly<Record<string, string>> = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'e',
    ж: 'zh',
    з: 'z',
    и: 'i',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'kh',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'shch',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
};

export type SlugFallback = 'agent' | 'product';

/** Slug агента или продукта: латиница, цифры и дефисы. */
export const Slug = {
    fromName(name: string, fallback: SlugFallback): string {
        const latin = name
            .toLowerCase()
            .replace(/[\u0400-\u04FF]/gu, (char) => TRANSLIT[char] ?? char);
        const slug = latin
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, MAX_SLUG_BASE_LENGTH)
            .replace(/-+$/g, '');
        return slug.length > 0 ? slug : fallback;
    },

    withSuffix(base: string, n: number): string {
        return `${base}-${String(n)}`;
    },
} as const;
