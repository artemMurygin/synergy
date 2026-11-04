import { parseClosedSet } from './closed-set';

export const PROGRAM_LEVELS = [
    'spo',
    'bachelor',
    'specialist',
    'master',
    'postgrad',
    'dpo_pp',
    'dpo_pk',
    'short_course',
    'kids',
    'camp',
] as const;

export type ProgramLevel = (typeof PROGRAM_LEVELS)[number];

export function parseProgramLevel(value: string): ProgramLevel {
    return parseClosedSet('program level', PROGRAM_LEVELS, value);
}
