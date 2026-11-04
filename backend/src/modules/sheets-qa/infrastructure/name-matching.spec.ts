import { describe, expect, it } from 'vitest';
import { assignByName, normalizeName, similarity, titleSimilarity } from './name-matching';

describe('normalizeName', () => {
    it('drops direction codes, accreditation notes and punctuation', () => {
        expect(normalizeName('Лечебное дело    31.02.01')).toBe('лечебное дело');
        expect(normalizeName('Музыка НЕТ АККРЕДИТАЦИИ (НЕТ ОТСРОЧКИ) ')).toBe('музыка');
        expect(normalizeName('Кино- и телепроизводство (по видам)')).toBe(
            'кино и телепроизводство по видам',
        );
    });
});

describe('similarity', () => {
    it('is 1 for equal strings and 0 for empty or disjoint ones', () => {
        expect(similarity('фармация', 'фармация')).toBe(1);
        expect(similarity('', 'фармация')).toBe(0);
        expect(similarity('abc', 'xyz')).toBe(0);
    });
});

describe('assignByName', () => {
    const faculty = 'медицинский';
    it('matches each source to its closest target one-to-one', () => {
        const sources = [
            { row: 7, faculty, text: 'сестринское дело медицинская сестра' },
            { row: 8, faculty, text: 'фармация фармацевт' },
        ];
        const targets = [
            { row: 3, faculty, text: 'фармация фармацевт' },
            { row: 2, faculty, text: 'сестринское дело медицинская сестра медицинский брат' },
        ];
        const matches = assignByName(sources, targets);
        expect(matches.map((m) => [m.source, m.target])).toEqual(
            expect.arrayContaining([
                [7, 2],
                [8, 3],
            ]),
        );
    });

    it('leaves a source without a similar target unmatched', () => {
        const matches = assignByName(
            [{ row: 1, faculty, text: 'юриспруденция юрист' }],
            [{ row: 2, faculty, text: 'фармация фармацевт' }],
        );
        expect(matches).toEqual([]);
    });

    it('does not reuse a target twice', () => {
        const matches = assignByName(
            [
                { row: 1, faculty, text: 'фармация фармацевт' },
                { row: 2, faculty, text: 'фармация фармацевт' },
            ],
            [{ row: 9, faculty, text: 'фармация фармацевт' }],
        );
        expect(matches).toHaveLength(1);
    });
});

describe('titleSimilarity', () => {
    it('treats a price title that is part of the longer base title as the same program', () => {
        expect(
            titleSimilarity(
                'Психология Коучинг и психологическое консультирование',
                'Психология Профиль: Коучинг и психологическое консультирование',
            ),
        ).toBeGreaterThanOrEqual(0.9);
        expect(titleSimilarity('Экономика -', 'Экономика Корпоративная экономика')).toBe(1);
    });

    it('ignores endings, codes and accreditation notes', () => {
        expect(titleSimilarity('Торговое дело', 'Специалист торгового дела')).toBe(1);
        expect(
            titleSimilarity(
                'Мехатроника и робототехника Аккредитации нет! Отсрочки нет!',
                'Мехатроника и робототехника Профиль: Промышленные и сервисные роботы',
            ),
        ).toBe(1);
        expect(titleSimilarity('38.02.06 Финансы', 'Финансы')).toBe(1);
    });

    it('keeps different programs apart', () => {
        expect(
            titleSimilarity(
                'Техническая эксплуатация и сопровождение ИС',
                'Технология машиностроения',
            ),
        ).toBeLessThan(0.5);
        expect(titleSimilarity('Торговое дело', 'Коммерция (по отраслям)')).toBe(0);
        expect(
            titleSimilarity('Финансы в корпорации', 'Финансовые рынки и кредитные организации'),
        ).toBeLessThan(0.7);
    });

    it('matches nothing when a title has no words', () => {
        expect(titleSimilarity('', 'Финансы')).toBe(0);
        expect(titleSimilarity('-', 'Финансы')).toBe(0);
    });
});
