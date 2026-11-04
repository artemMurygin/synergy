import { readFileSync } from 'node:fs';
import { ProgramsSyncError } from '../application/errors/programs-sync.error';
import { ORGANIZATION_KINDS } from '../domain/value-objects/organization-kind';
import {
    createProgramsGroup,
    type GroupOrganization,
    isRunnableGroup,
    type GroupId,
    type GroupSource,
    type ProgramsGroup,
} from '../application/models/programs-group';
import type { GroupRegistryPort } from '../application/ports/programs-etl.ports';

function invalid(message: string): never {
    throw new ProgramsSyncError('INVALID_WORKFLOW_DATA', `groups.json: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string, where: string): string {
    const value = record[key];
    if (typeof value !== 'string' || value.length === 0) {
        return invalid(`${where}.${key} must be a non-empty string`);
    }
    return value;
}

function optionalString(
    record: Record<string, unknown>,
    key: string,
    where: string,
): string | undefined {
    const value = record[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'string') return invalid(`${where}.${key} must be a string`);
    return value;
}

function parseSource(raw: unknown, where: string): GroupSource {
    if (!isRecord(raw)) return invalid(`${where} must be an object`);
    const sheetId = raw.sheet_id;
    if (typeof sheetId !== 'number' || !Number.isInteger(sheetId)) {
        return invalid(`${where}.sheet_id must be an integer`);
    }
    const spreadsheetId = requireString(raw, 'spreadsheet_id', where);
    const role = optionalString(raw, 'role', where);
    const base = {
        // Deterministic, so the id survives restarts and stays valid in stored source state.
        sourceId: `${spreadsheetId}:${String(sheetId)}`,
        book: requireString(raw, 'book', where),
        spreadsheetId,
        sheetId,
        title: requireString(raw, 'title', where),
        url: requireString(raw, 'url', where),
    };
    return role === undefined ? base : { ...base, role };
}

function parseOrganizations(raw: unknown, where: string): GroupOrganization[] | undefined {
    if (raw === undefined) return undefined;
    if (!Array.isArray(raw)) return invalid(`${where}.organizations must be an array`);
    return raw.map((item, i): GroupOrganization => {
        const at = `${where}.organizations[${String(i)}]`;
        if (!isRecord(item)) return invalid(`${at} must be an object`);
        const kind = ORGANIZATION_KINDS.find((candidate) => candidate === item.kind);
        if (kind === undefined) {
            return invalid(`${at}.kind must be one of ${ORGANIZATION_KINDS.join(', ')}`);
        }
        const parentName = optionalString(item, 'parent_name', at);
        const hint = optionalString(item, 'hint', at);
        return {
            kind,
            name: requireString(item, 'name', at),
            ...(parentName === undefined ? {} : { parentName }),
            ...(hint === undefined ? {} : { hint }),
        };
    });
}

function parseGroup(raw: unknown, index: number): ProgramsGroup {
    const where = `groups[${String(index)}]`;
    if (!isRecord(raw)) return invalid(`${where} must be an object`);
    const sheets = raw.sheets;
    if (!Array.isArray(sheets)) return invalid(`${where}.sheets must be an array`);
    const note = optionalString(raw, 'note', where);
    const organizations = parseOrganizations(raw.organizations, where);
    const input = {
        id: requireString(raw, 'id', where),
        name: requireString(raw, 'name', where),
        status: requireString(raw, 'status', where),
        sources: sheets.map((sheet, i) => parseSource(sheet, `${where}.sheets[${String(i)}]`)),
    };
    return createProgramsGroup({
        ...input,
        ...(note === undefined ? {} : { note }),
        ...(organizations === undefined ? {} : { organizations }),
    });
}

/** Read-only registry over `groups.json`; source order is the file order. */
export class JsonGroupRegistry implements GroupRegistryPort {
    private readonly groups: readonly ProgramsGroup[];

    constructor(definition: unknown) {
        if (!isRecord(definition) || !Array.isArray(definition.groups)) {
            return invalid('"groups" must be an array');
        }
        const groups = definition.groups.map((raw, i) => parseGroup(raw, i));
        const groupIds = new Set<string>();
        const sourceIds = new Set<string>();
        for (const group of groups) {
            if (groupIds.has(group.id)) invalid(`duplicate group id ${group.id}`);
            groupIds.add(group.id);
            for (const source of group.sources) {
                if (sourceIds.has(source.sourceId)) {
                    invalid(`duplicate source ${source.sourceId}`);
                }
                sourceIds.add(source.sourceId);
            }
        }
        this.groups = groups;
    }

    static fromFile(path: string): JsonGroupRegistry {
        let parsed: unknown;
        try {
            parsed = JSON.parse(readFileSync(path, 'utf8'));
        } catch (error) {
            return invalid(
                `cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
        return new JsonGroupRegistry(parsed);
    }

    listScheduledGroups(): Promise<ProgramsGroup[]> {
        return Promise.resolve(this.groups.filter(isRunnableGroup));
    }

    getGroup(groupId: GroupId): Promise<ProgramsGroup | null> {
        return Promise.resolve(this.groups.find((group) => group.id === groupId) ?? null);
    }
}
