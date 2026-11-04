import { parseClosedSet } from './closed-set';

export const STUDY_FORMS = [
    'full_time',
    'mixed',
    'extramural',
    'distance',
    'distance_tutor',
    'online',
] as const;

export type StudyForm = (typeof STUDY_FORMS)[number];

export function parseStudyForm(value: string): StudyForm {
    return parseClosedSet('study form', STUDY_FORMS, value);
}
