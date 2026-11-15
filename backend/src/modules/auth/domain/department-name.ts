export const MAX_DEPARTMENT_NAME_LENGTH = 200;

export class InvalidDepartmentNameError extends Error {}

/** Department name: trimmed, 1-200 characters. */
export class DepartmentName {
    private constructor(readonly value: string) {}

    static of(raw: string): DepartmentName {
        const value = raw.trim();
        if (value.length === 0) {
            throw new InvalidDepartmentNameError('Department name must not be empty');
        }
        if (value.length > MAX_DEPARTMENT_NAME_LENGTH) {
            throw new InvalidDepartmentNameError(
                `Department name is longer than ${String(MAX_DEPARTMENT_NAME_LENGTH)} characters`,
            );
        }
        return new DepartmentName(value);
    }

    equals(other: DepartmentName): boolean {
        return this.value === other.value;
    }
}
