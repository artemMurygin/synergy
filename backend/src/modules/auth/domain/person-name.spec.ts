import { describe, expect, it } from 'vitest';
import { InvalidPersonNameError, MAX_PERSON_NAME_PART_LENGTH, PersonName } from './person-name';

describe('PersonName', () => {
    it('trims every part', () => {
        const name = PersonName.of({
            lastName: '  Иванов ',
            firstName: ' Иван',
            middleName: 'Петрович  ',
        });
        expect(name.lastName).toBe('Иванов');
        expect(name.firstName).toBe('Иван');
        expect(name.middleName).toBe('Петрович');
    });

    it('treats a blank middle name as absent', () => {
        expect(
            PersonName.of({ lastName: 'Иванов', firstName: 'Иван', middleName: '   ' }).middleName,
        ).toBeUndefined();
        expect(PersonName.of({ lastName: 'Иванов', firstName: 'Иван' }).middleName).toBeUndefined();
    });

    it('requires a last name and a first name', () => {
        expect(() => PersonName.of({ lastName: '  ', firstName: 'Иван' })).toThrow(
            InvalidPersonNameError,
        );
        expect(() => PersonName.of({ lastName: 'Иванов', firstName: '' })).toThrow(
            InvalidPersonNameError,
        );
    });

    it('limits each part to 200 characters', () => {
        const max = 'а'.repeat(MAX_PERSON_NAME_PART_LENGTH);
        expect(MAX_PERSON_NAME_PART_LENGTH).toBe(200);
        expect(PersonName.of({ lastName: max, firstName: max, middleName: max }).lastName).toBe(
            max,
        );
        const tooLong = `${max}а`;
        expect(() => PersonName.of({ lastName: tooLong, firstName: 'Иван' })).toThrow(
            InvalidPersonNameError,
        );
        expect(() => PersonName.of({ lastName: 'Иванов', firstName: tooLong })).toThrow(
            InvalidPersonNameError,
        );
        expect(() =>
            PersonName.of({ lastName: 'Иванов', firstName: 'Иван', middleName: tooLong }),
        ).toThrow(InvalidPersonNameError);
    });
});
