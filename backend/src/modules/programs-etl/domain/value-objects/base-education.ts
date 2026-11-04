import { parseClosedSet } from './closed-set';

export const BASE_EDUCATIONS = ['grade9', 'grade11', 'spo', 'vo', 'any'] as const;

export type BaseEducation = (typeof BASE_EDUCATIONS)[number];

export function parseBaseEducation(value: string): BaseEducation {
    return parseClosedSet('base education', BASE_EDUCATIONS, value);
}
