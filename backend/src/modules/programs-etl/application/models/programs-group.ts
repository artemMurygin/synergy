import {
    ORGANIZATION_KINDS,
    type OrganizationKind,
} from '../../domain/value-objects/organization-kind';
import { ProgramsSyncError } from '../errors/programs-sync.error';

export type GroupId = string;

export { ORGANIZATION_KINDS };

export const GROUP_STATUSES = [
    'ready',
    'needs_matching',
    'out_of_scope_schema',
    'deferred',
] as const;

export type GroupStatus = (typeof GROUP_STATUSES)[number];

/** Sheet the agent of the current group is allowed to read. */
export interface GroupSource {
    readonly sourceId: string;
    readonly book: string;
    readonly spreadsheetId: string;
    readonly sheetId: number;
    readonly title: string;
    readonly role?: string;
    readonly url: string;
}

/** Organization that owns the programs of a group; set in groups.json, never guessed by the agent. */
export interface GroupOrganization {
    readonly kind: OrganizationKind;
    readonly name: string;
    /** Name of the parent organization (e.g. the university of a branch), if any. */
    readonly parentName?: string;
    /** How to tell this organization's rows apart when a group mixes several. */
    readonly hint?: string;
}

/** Snapshot of a job from groups.json. */
export interface ProgramsGroup {
    readonly id: GroupId;
    readonly name: string;
    readonly status: GroupStatus;
    readonly note?: string;
    readonly organizations?: readonly GroupOrganization[];
    readonly sources: readonly GroupSource[];
}

export function createProgramsGroup(input: {
    id: GroupId;
    name: string;
    status: string;
    note?: string;
    organizations?: readonly GroupOrganization[];
    sources: readonly GroupSource[];
}): ProgramsGroup {
    const status = GROUP_STATUSES.find((candidate) => candidate === input.status);
    if (status === undefined) {
        throw new ProgramsSyncError(
            'INVALID_WORKFLOW_DATA',
            `Unknown group status: ${input.status}`,
        );
    }
    const base = { id: input.id, name: input.name, status, sources: [...input.sources] };
    return {
        ...base,
        ...(input.note === undefined ? {} : { note: input.note }),
        ...(input.organizations === undefined || input.organizations.length === 0
            ? {}
            : { organizations: [...input.organizations] }),
    };
}

/** Only `ready` groups may be scheduled in the first version. */
export function isRunnableGroup(group: ProgramsGroup): boolean {
    return group.status === 'ready';
}
