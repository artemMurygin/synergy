import { parseClosedSet } from './closed-set';

export const ORGANIZATION_KINDS = [
    'university',
    'college',
    'branch',
    'academy',
    'partner',
    'school',
] as const;

export type OrganizationKind = (typeof ORGANIZATION_KINDS)[number];

export function parseOrganizationKind(value: string): OrganizationKind {
    return parseClosedSet('organization kind', ORGANIZATION_KINDS, value);
}
