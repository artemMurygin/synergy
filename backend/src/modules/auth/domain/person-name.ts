export const MAX_PERSON_NAME_PART_LENGTH = 200;

export class InvalidPersonNameError extends Error {}

export interface PersonNameInput {
    lastName: string;
    firstName: string;
    middleName?: string | null;
}

/** Employee name: trimmed parts, last and first name are required, 1-200 characters each. */
export class PersonName {
    private constructor(
        readonly lastName: string,
        readonly firstName: string,
        readonly middleName: string | undefined,
    ) {}

    static of(input: PersonNameInput): PersonName {
        const lastName = PersonName.required(input.lastName, 'Last name');
        const firstName = PersonName.required(input.firstName, 'First name');
        const middle = (input.middleName ?? '').trim();
        if (middle.length > MAX_PERSON_NAME_PART_LENGTH) {
            throw new InvalidPersonNameError(PersonName.tooLong('Middle name'));
        }
        return new PersonName(lastName, firstName, middle.length > 0 ? middle : undefined);
    }

    private static required(raw: string, label: string): string {
        const value = raw.trim();
        if (value.length === 0) throw new InvalidPersonNameError(`${label} must not be empty`);
        if (value.length > MAX_PERSON_NAME_PART_LENGTH) {
            throw new InvalidPersonNameError(PersonName.tooLong(label));
        }
        return value;
    }

    private static tooLong(label: string): string {
        return `${label} is longer than ${String(MAX_PERSON_NAME_PART_LENGTH)} characters`;
    }
}
