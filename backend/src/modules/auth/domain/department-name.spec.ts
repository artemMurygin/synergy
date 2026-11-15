import { describe, expect, it } from 'vitest';
import {
    DepartmentName,
    InvalidDepartmentNameError,
    MAX_DEPARTMENT_NAME_LENGTH,
} from './department-name';

describe('DepartmentName', () => {
    it('trims', () => {
        expect(DepartmentName.of('  Разработка ').value).toBe('Разработка');
    });

    it('rejects an empty name', () => {
        expect(() => DepartmentName.of('')).toThrow(InvalidDepartmentNameError);
        expect(() => DepartmentName.of('   ')).toThrow(InvalidDepartmentNameError);
    });

    it('limits the length to 200 characters', () => {
        expect(MAX_DEPARTMENT_NAME_LENGTH).toBe(200);
        const max = 'а'.repeat(200);
        expect(DepartmentName.of(max).value).toBe(max);
        expect(() => DepartmentName.of(`${max}а`)).toThrow(InvalidDepartmentNameError);
    });

    it('compares by value', () => {
        expect(DepartmentName.of('A').equals(DepartmentName.of(' A '))).toBe(true);
    });
});
