/** Lower-cased text with collapsed whitespace and without direction codes (31.02.01). */
export function normalizeName(text: string): string {
    return text
        .toLowerCase()
        .replace(/\d\d\.\d\d\.\d\d/g, ' ')
        .replace(/нет аккредитации|\(нет отсрочки\)/g, ' ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

function bigrams(text: string): Map<string, number> {
    const result = new Map<string, number>();
    for (let i = 0; i < text.length - 1; i += 1) {
        const pair = text.slice(i, i + 2);
        result.set(pair, (result.get(pair) ?? 0) + 1);
    }
    return result;
}

/** Sørensen–Dice similarity of two strings by character bigrams, 0..1. */
export function similarity(a: string, b: string): number {
    if (a.length === 0 || b.length === 0) return 0;
    if (a === b) return 1;
    const left = bigrams(a);
    const right = bigrams(b);
    let common = 0;
    for (const [pair, count] of left) common += Math.min(count, right.get(pair) ?? 0);
    return (2 * common) / (Math.max(a.length - 1, 0) + Math.max(b.length - 1, 0));
}

/** Words that say nothing about which program a title is. */
const TITLE_NOISE = new Set([
    'программа',
    'профиль',
    'направление',
    'аккредитована',
    'аккредитации',
    'аккредитация',
    'образовательная',
    'летом',
    'колледж',
    'маг',
    'нет',
    'отсрочки',
    'отсрочка',
]);
const STEM_LENGTH = 5;
const MIN_STEM_LENGTH = 3;

/** First letters of a word, so that endings do not matter («дело» and «дела» are one stem). */
function stemOf(word: string): string {
    return word.length <= STEM_LENGTH
        ? word.slice(0, Math.max(MIN_STEM_LENGTH, word.length - 1))
        : word.slice(0, STEM_LENGTH);
}

function titleStems(text: string): string[] {
    return normalizeName(text)
        .split(' ')
        .filter((word) => word.length > 2 && !TITLE_NOISE.has(word))
        .map(stemOf);
}

/**
 * How well two program titles match, 0..1. A price row names the direction and sometimes the
 * profile, the methodical base adds more words, so the share of the shorter title that is found in
 * the longer one counts as well as the bigram similarity. Words are compared by their first
 * letters, which ignores endings. A title without words matches nothing.
 */
export function titleSimilarity(a: string, b: string): number {
    const left = titleStems(a);
    const right = titleStems(b);
    if (left.length === 0 || right.length === 0) return 0;
    const dice = similarity(left.join(' '), right.join(' '));
    const rightSet = new Set(right);
    const leftSet = new Set(left);
    let common = 0;
    for (const stem of leftSet) if (rightSet.has(stem)) common += 1;
    return Math.max(dice, common / Math.min(leftSet.size, rightSet.size));
}

export interface MatchCandidate {
    readonly row: number;
    readonly faculty: string;
    readonly text: string;
}

export interface Match {
    readonly source: number;
    readonly target: number;
    readonly score: number;
}

const MIN_SCORE = 0.5;
const FACULTY_WEIGHT = 0.2;

function score(source: MatchCandidate, target: MatchCandidate): number {
    return (
        similarity(source.text, target.text) * (1 - FACULTY_WEIGHT) +
        similarity(source.faculty, target.faculty) * FACULTY_WEIGHT
    );
}

/** One-to-one assignment, best scores first; pairs below the threshold stay unmatched. */
export function assignByName(
    sources: readonly MatchCandidate[],
    targets: readonly MatchCandidate[],
): Match[] {
    const pairs: Match[] = [];
    for (const source of sources) {
        for (const target of targets) {
            pairs.push({ source: source.row, target: target.row, score: score(source, target) });
        }
    }
    pairs.sort((a, b) => b.score - a.score || a.source - b.source || a.target - b.target);
    const usedSources = new Set<number>();
    const usedTargets = new Set<number>();
    const matches: Match[] = [];
    for (const pair of pairs) {
        if (pair.score < MIN_SCORE) break;
        if (usedSources.has(pair.source) || usedTargets.has(pair.target)) continue;
        usedSources.add(pair.source);
        usedTargets.add(pair.target);
        matches.push(pair);
    }
    return matches;
}
