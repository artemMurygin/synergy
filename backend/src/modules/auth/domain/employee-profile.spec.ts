import { describe, expect, it } from 'vitest';
import { Email, InvalidEmailError } from './email';
import { EmployeeProfile } from './employee-profile';
import { InvalidPersonNameError, PersonName } from './person-name';

const fresh = (): EmployeeProfile =>
    EmployeeProfile.create({
        userId: 'u1',
        name: PersonName.of({ lastName: 'Иванов', firstName: 'Иван', middleName: 'Петрович' }),
        departmentId: 'dep-1',
        position: 'Разработчик',
        email: Email.of('Ivan@Example.com'),
        scrmEmployeeId: 'scrm-1',
    });

describe('EmployeeProfile', () => {
    it('is created with the given data and optional fields default to absent', () => {
        const p = fresh();
        expect(p.userId).toBe('u1');
        expect(p.name.lastName).toBe('Иванов');
        expect(p.departmentId).toBe('dep-1');
        expect(p.position).toBe('Разработчик');
        expect(p.email?.value).toBe('ivan@example.com');
        expect(p.scrmEmployeeId).toBe('scrm-1');

        const bare = EmployeeProfile.create({
            userId: 'u2',
            name: PersonName.of({ lastName: 'Петров', firstName: 'Пётр' }),
        });
        expect(bare.departmentId).toBeUndefined();
        expect(bare.position).toBeUndefined();
        expect(bare.email).toBeUndefined();
        expect(bare.scrmEmployeeId).toBeUndefined();
        expect(bare.name.middleName).toBeUndefined();
    });

    it('applyPatch keeps fields that are not passed', () => {
        const p = fresh();
        p.applyPatch({ position: 'Тимлид' });
        expect(p.position).toBe('Тимлид');
        expect(p.name.lastName).toBe('Иванов');
        expect(p.name.middleName).toBe('Петрович');
        expect(p.departmentId).toBe('dep-1');
        expect(p.email?.value).toBe('ivan@example.com');
        expect(p.scrmEmployeeId).toBe('scrm-1');
    });

    it('applyPatch updates the name parts independently', () => {
        const p = fresh();
        p.applyPatch({ firstName: 'Пётр' });
        expect(p.name.firstName).toBe('Пётр');
        expect(p.name.lastName).toBe('Иванов');
        expect(p.name.middleName).toBe('Петрович');
    });

    it('an empty string or null clears an optional field', () => {
        const p = fresh();
        p.applyPatch({ position: '', email: '   ', scrmEmployeeId: null, middleName: '' });
        expect(p.position).toBeUndefined();
        expect(p.email).toBeUndefined();
        expect(p.scrmEmployeeId).toBeUndefined();
        expect(p.name.middleName).toBeUndefined();
        expect(p.departmentId).toBe('dep-1');

        p.applyPatch({ departmentId: null });
        expect(p.departmentId).toBeUndefined();
    });

    it('an empty department id clears the department', () => {
        const p = fresh();
        p.applyPatch({ departmentId: '' });
        expect(p.departmentId).toBeUndefined();
    });

    it('last and first name stay non-empty', () => {
        const p = fresh();
        expect(() => {
            p.applyPatch({ lastName: '  ' });
        }).toThrow(InvalidPersonNameError);
        expect(() => {
            p.applyPatch({ firstName: '' });
        }).toThrow(InvalidPersonNameError);
        expect(p.name.lastName).toBe('Иванов');
        expect(p.name.firstName).toBe('Иван');
    });

    it('a rejected patch changes nothing', () => {
        const p = fresh();
        expect(() => {
            p.applyPatch({ position: 'Тимлид', email: 'not-an-email' });
        }).toThrow(InvalidEmailError);
        expect(p.position).toBe('Разработчик');
    });

    it('normalizes an email passed to a patch', () => {
        const p = fresh();
        p.applyPatch({ email: '  New@Example.COM ' });
        expect(p.email?.value).toBe('new@example.com');
    });

    it('trims the position and the SCRM id', () => {
        const p = fresh();
        p.applyPatch({ position: '  Тимлид ', scrmEmployeeId: ' s-2 ' });
        expect(p.position).toBe('Тимлид');
        expect(p.scrmEmployeeId).toBe('s-2');
    });

    it('restore keeps the stored values', () => {
        const p = EmployeeProfile.restore({
            userId: 'u9',
            name: PersonName.of({ lastName: 'Сидоров', firstName: 'Сидор' }),
            position: 'QA',
        });
        expect(p.userId).toBe('u9');
        expect(p.position).toBe('QA');
    });
});
