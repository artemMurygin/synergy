import { describe, expect, it } from 'vitest';
import { formatFullName } from './full-name';

describe('formatFullName', () => {
    it('собирает фамилию, имя и отчество через пробел', () => {
        expect(
            formatFullName(
                { lastName: 'Иванов', firstName: 'Иван', middleName: 'Иванович' },
                'ivanov',
            ),
        ).toBe('Иванов Иван Иванович');
    });

    it('пропускает незаполненное отчество без лишних пробелов', () => {
        expect(
            formatFullName({ lastName: 'Петров', firstName: 'Пётр', middleName: null }, 'petrov'),
        ).toBe('Петров Пётр');
        expect(formatFullName({ lastName: 'Петров', firstName: 'Пётр' }, 'petrov')).toBe(
            'Петров Пётр',
        );
    });

    it('обрезает пробелы по краям и не оставляет двойных пробелов', () => {
        expect(
            formatFullName(
                { lastName: '  Иванов ', firstName: ' Иван', middleName: 'Иванович  ' },
                'x',
            ),
        ).toBe('Иванов Иван Иванович');
        expect(
            formatFullName({ lastName: 'Иванов', firstName: '   ', middleName: 'Иванович' }, 'x'),
        ).toBe('Иванов Иванович');
    });

    it('возвращает логин, если все три части пусты', () => {
        expect(
            formatFullName({ lastName: null, firstName: null, middleName: null }, 'user10'),
        ).toBe('user10');
        expect(formatFullName({}, 'user10')).toBe('user10');
    });

    it('считает пустые строки и строки из пробелов незаполненными', () => {
        expect(formatFullName({ lastName: '', firstName: '  ', middleName: '\t' }, 'user10')).toBe(
            'user10',
        );
        expect(formatFullName({ lastName: '', firstName: 'Иван', middleName: '' }, 'user10')).toBe(
            'Иван',
        );
    });
});
