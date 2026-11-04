import { parseClosedSet } from './closed-set';

export const PROGRAM_STATUSES = ['active', 'enrollment_closed', 'new'] as const;

export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

export function parseProgramStatus(value: string): ProgramStatus {
    return parseClosedSet('program status', PROGRAM_STATUSES, value);
}
