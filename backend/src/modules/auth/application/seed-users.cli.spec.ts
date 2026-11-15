import { describe, expect, it } from 'vitest';
import { formatSeedReport, loadSeedInput, parseSeedInput } from './seed-users.cli';

describe('parseSeedInput: file format', () => {
    it('parses an object with departments and users', () => {
        const input = parseSeedInput(
            JSON.stringify({
                departments: [
                    { id: 'dev', name: 'Разработка', head: 'ivan' },
                    { id: 'qa', name: 'QA' },
                ],
                users: [
                    {
                        login: 'ivan',
                        lastName: 'Иванов',
                        firstName: 'Иван',
                        middleName: 'Петрович',
                        departmentId: 'dev',
                        position: 'Тимлид',
                        email: 'ivan@example.com',
                        scrmEmployeeId: 'scrm-1',
                        password: 'Temp-pass-1',
                        roles: ['admin'],
                    },
                ],
            }),
        );

        expect(input.departments).toEqual([
            { id: 'dev', name: 'Разработка', head: 'ivan' },
            { id: 'qa', name: 'QA' },
        ]);
        expect(input.users[0]).toMatchObject({
            login: 'ivan',
            lastName: 'Иванов',
            departmentId: 'dev',
            roles: ['admin'],
        });
    });

    it('allows a file without departments', () => {
        const input = parseSeedInput('{"users":[{"login":"a","lastName":"А","firstName":"Б"}]}');

        expect(input.departments).toEqual([]);
        expect(input.users).toHaveLength(1);
    });

    it('requires last and first name for users of the object format', () => {
        expect(() => parseSeedInput('{"users":[{"login":"a"}]}')).toThrow();
        expect(() => parseSeedInput('{"users":[{"login":"a","lastName":"А"}]}')).toThrow();
    });

    it('rejects an unknown role, a wrong type and unknown keys', () => {
        const user = { login: 'a', lastName: 'А', firstName: 'Б' };
        expect(() =>
            parseSeedInput(JSON.stringify({ users: [{ ...user, roles: ['root'] }] })),
        ).toThrow();
        expect(() =>
            parseSeedInput(JSON.stringify({ users: [{ ...user, roles: 'admin' }] })),
        ).toThrow();
        expect(() =>
            parseSeedInput(JSON.stringify({ users: [{ ...user, lastNme: 'x' }] })),
        ).toThrow();
        expect(() => parseSeedInput('{"departments":[{"name":"x"}],"users":[]}')).toThrow();
    });

    it('rejects malformed input', () => {
        expect(() => parseSeedInput('{')).toThrow();
        expect(() => parseSeedInput('42')).toThrow();
        expect(() => parseSeedInput('{"departments":[]}')).toThrow();
    });
});

describe('parseSeedInput: legacy array', () => {
    it('parses logins with optional password and roles as users without profile', () => {
        expect(
            parseSeedInput('[{"login":"a"},{"login":"b","password":"p","roles":["developer"]}]'),
        ).toEqual({
            departments: [],
            users: [{ login: 'a' }, { login: 'b', password: 'p', roles: ['developer'] }],
        });
    });

    it('rejects an unknown role and malformed entries', () => {
        expect(() => parseSeedInput('[{"login":"a","roles":["root"]}]')).toThrow();
        expect(() => parseSeedInput('[{"login":"a","roles":"developer"}]')).toThrow();
        expect(() => parseSeedInput('[{"password":"p"}]')).toThrow();
    });
});

describe('loadSeedInput', () => {
    const files: Partial<Record<string, string>> = {
        '/seed.json': '{"users":[{"login":"f","lastName":"Ф","firstName":"Ф"}]}',
    };
    const readFile = (path: string): string => {
        const content = files[path];
        if (content === undefined) throw new Error(`ENOENT: ${path}`);
        return content;
    };

    it('reads the file by path', () => {
        const input = loadSeedInput({ filePath: '/seed.json', readFile });

        expect(input.users.map((u) => u.login)).toEqual(['f']);
    });

    it('reads the legacy variable when no file is given', () => {
        const input = loadSeedInput({ legacyUsers: '[{"login":"old"}]', readFile });

        expect(input.users).toEqual([{ login: 'old' }]);
    });

    it('fails when both the file and AUTH_SEED_USERS are set', () => {
        expect(() =>
            loadSeedInput({ filePath: '/seed.json', legacyUsers: '[{"login":"old"}]', readFile }),
        ).toThrow(/AUTH_SEED_FILE.*AUTH_SEED_USERS/);
    });

    it('fails when there is nothing to load', () => {
        expect(() => loadSeedInput({ readFile })).toThrow(/nothing to seed/);
        expect(() => loadSeedInput({ filePath: ' ', legacyUsers: '  ', readFile })).toThrow(
            /nothing to seed/,
        );
    });

    it('fails with the path when the file cannot be read', () => {
        expect(() => loadSeedInput({ filePath: '/missing.json', readFile })).toThrow(
            /missing\.json/,
        );
    });
});

describe('formatSeedReport', () => {
    it('prints departments, generated passwords and skipped records', () => {
        const text = formatSeedReport({
            departments: { created: ['dev'], skipped: ['qa'] },
            users: {
                created: [{ login: 'a', generatedPassword: 'pw1' }, { login: 'b' }],
                skipped: ['c'],
            },
        });

        expect(text).toContain('department created: dev');
        expect(text).toContain('department skipped: qa');
        expect(text).toContain('a\tpw1');
        expect(text).toContain('created: b');
        expect(text).toContain('skipped: c');
    });
});
