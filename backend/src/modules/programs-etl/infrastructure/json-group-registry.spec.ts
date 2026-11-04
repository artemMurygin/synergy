import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { ProgramsSyncError } from '../application/errors/programs-sync.error';
import { JsonGroupRegistry } from './json-group-registry';

const sheet = (n: number, book = 'main'): Record<string, unknown> => ({
    book,
    spreadsheet_id: `ss-${book}`,
    sheet_id: n,
    title: `Sheet ${String(n)}`,
    role: 'catalog',
    url: `https://docs.google.com/spreadsheets/d/ss-${book}/edit?gid=${String(n)}`,
});

const definition = (): { groups: Record<string, unknown>[] } => ({
    groups: [
        {
            id: 'a',
            name: 'Group A',
            status: 'ready',
            note: 'note a',
            sheets: [sheet(2), sheet(1, 'short')],
        },
        { id: 'b', name: 'Group B', status: 'needs_matching', sheets: [sheet(3)] },
        { id: 'c', name: 'Group C', status: 'out_of_scope_schema', sheets: [sheet(4)] },
        { id: 'd', name: 'Group D', status: 'deferred', sheets: [sheet(5)] },
        { id: 'e', name: 'Group E', status: 'ready', sheets: [sheet(6)] },
    ],
});

describe('JsonGroupRegistry', () => {
    it('reads and validates group organizations', async () => {
        const raw = definition();
        raw.groups[0] = {
            ...raw.groups[0],
            organizations: [
                {
                    kind: 'college',
                    name: 'College X',
                    parent_name: 'University X',
                    hint: 'rows 2-9',
                },
            ],
        };
        const group = await new JsonGroupRegistry(raw).getGroup('a');
        expect(group?.organizations).toEqual([
            { kind: 'college', name: 'College X', parentName: 'University X', hint: 'rows 2-9' },
        ]);

        const bad = definition();
        bad.groups[0] = { ...bad.groups[0], organizations: [{ kind: 'planet', name: 'X' }] };
        expect(() => new JsonGroupRegistry(bad)).toThrow(ProgramsSyncError);
    });

    it('keeps the group sources in the order of groups.json', async () => {
        const registry = new JsonGroupRegistry(definition());
        const group = await registry.getGroup('a');
        expect(group?.sources.map((s) => s.sheetId)).toEqual([2, 1]);
    });

    it('reads group and source metadata', async () => {
        const registry = new JsonGroupRegistry(definition());
        const group = await registry.getGroup('a');
        expect(group).toMatchObject({ id: 'a', name: 'Group A', status: 'ready', note: 'note a' });
        expect(group?.sources[1]).toEqual({
            sourceId: 'ss-short:1',
            book: 'short',
            spreadsheetId: 'ss-short',
            sheetId: 1,
            title: 'Sheet 1',
            role: 'catalog',
            url: 'https://docs.google.com/spreadsheets/d/ss-short/edit?gid=1',
        });
    });

    it('lists only ready groups for scheduled scans, in file order', async () => {
        const registry = new JsonGroupRegistry(definition());
        const groups = await registry.listScheduledGroups();
        expect(groups.map((g) => g.id)).toEqual(['a', 'e']);
        expect(groups.every((g) => g.status === 'ready')).toBe(true);
    });

    it('still returns non-ready groups from getGroup but never schedules them', async () => {
        const registry = new JsonGroupRegistry(definition());
        for (const id of ['b', 'c', 'd']) {
            expect(await registry.getGroup(id)).not.toBeNull();
        }
        const scheduled = (await registry.listScheduledGroups()).map((g) => g.id);
        expect(scheduled).not.toContain('b');
        expect(scheduled).not.toContain('c');
        expect(scheduled).not.toContain('d');
    });

    it('returns null for an unknown group', async () => {
        const registry = new JsonGroupRegistry(definition());
        expect(await registry.getGroup('missing')).toBeNull();
    });

    it('rejects an unknown status', () => {
        const bad = definition();
        bad.groups[0].status = 'weird';
        expect(() => new JsonGroupRegistry(bad)).toThrow(ProgramsSyncError);
    });

    it('rejects duplicate group ids', () => {
        const bad = definition();
        bad.groups[1].id = 'a';
        expect(() => new JsonGroupRegistry(bad)).toThrow(ProgramsSyncError);
    });

    it('rejects a malformed definition', () => {
        expect(() => new JsonGroupRegistry({})).toThrow(ProgramsSyncError);
        expect(() => new JsonGroupRegistry(null)).toThrow(ProgramsSyncError);
        const noSheets = { groups: [{ id: 'x', name: 'X', status: 'ready' }] };
        expect(() => new JsonGroupRegistry(noSheets)).toThrow(ProgramsSyncError);
        const badSheet = {
            groups: [{ id: 'x', name: 'X', status: 'ready', sheets: [{ book: 'main' }] }],
        };
        expect(() => new JsonGroupRegistry(badSheet)).toThrow(ProgramsSyncError);
    });

    it('rejects duplicate source ids inside the registry', () => {
        const bad = definition();
        bad.groups[1].sheets = [sheet(2)];
        expect(() => new JsonGroupRegistry(bad)).toThrow(ProgramsSyncError);
    });

    it('loads the real groups.json and schedules only ready groups', async () => {
        const path = join(__dirname, '../../price-policy-rag/tabels-links/groups.json');
        const registry = JsonGroupRegistry.fromFile(path);
        const scheduled = await registry.listScheduledGroups();
        expect(scheduled.length).toBeGreaterThan(0);
        expect(scheduled.every((g) => g.status === 'ready')).toBe(true);
        expect(scheduled.map((g) => g.id)).not.toContain('synergy_postgrad');
        expect(await registry.getGroup('school_and_exam')).toMatchObject({
            status: 'out_of_scope_schema',
        });
    });

    it('fails on an unreadable file', () => {
        expect(() => JsonGroupRegistry.fromFile('/nonexistent/groups.json')).toThrow(
            ProgramsSyncError,
        );
    });
});
