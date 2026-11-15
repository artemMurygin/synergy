import { describe, expect, it } from 'vitest';
import { Department } from './department';
import { DepartmentName, InvalidDepartmentNameError } from './department-name';

const fresh = (): Department =>
    Department.create({ id: 'dep-1', name: DepartmentName.of('Разработка') });

describe('Department', () => {
    it('is created without a head', () => {
        const d = fresh();
        expect(d.id).toBe('dep-1');
        expect(d.name.value).toBe('Разработка');
        expect(d.headUserId).toBeUndefined();
    });

    it('can be created with a head', () => {
        const d = Department.create({
            id: 'dep-2',
            name: DepartmentName.of('Аналитика'),
            headUserId: 'u1',
        });
        expect(d.headUserId).toBe('u1');
    });

    it('renames', () => {
        const d = fresh();
        d.rename(DepartmentName.of('  Продукт '));
        expect(d.name.value).toBe('Продукт');
    });

    it('rejects an empty name', () => {
        expect(() => DepartmentName.of('  ')).toThrow(InvalidDepartmentNameError);
    });

    it('assigns, replaces and clears the head', () => {
        const d = fresh();
        d.assignHead('u1');
        expect(d.headUserId).toBe('u1');
        d.assignHead('u2');
        expect(d.headUserId).toBe('u2');
        d.clearHead();
        expect(d.headUserId).toBeUndefined();
        d.clearHead();
        expect(d.headUserId).toBeUndefined();
    });

    it('restore keeps the stored values', () => {
        const d = Department.restore({
            id: 'dep-3',
            name: DepartmentName.of('Тестирование'),
            headUserId: 'u7',
        });
        expect(d.headUserId).toBe('u7');
    });
});
