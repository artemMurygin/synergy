import { ArgumentInvalidError } from '../../../../shared/errors';

export const REQUIRED_FIELDS = [
    'clientName',
    'phone',
    'program',
    'studyForm',
    'leadSource',
    'pipelineStage',
] as const;

export type RequiredField = (typeof REQUIRED_FIELDS)[number];

export function parseRequiredField(value: string): RequiredField {
    const requiredField = REQUIRED_FIELDS.find((field) => field === value);
    if (requiredField === undefined) {
        throw new ArgumentInvalidError(`Unknown required field: ${value}`);
    }
    return requiredField;
}
