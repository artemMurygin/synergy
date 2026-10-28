export const Guard = {
    isEmpty(value: unknown): boolean {
        if (typeof value === 'number' || typeof value === 'boolean') {
            return false;
        }
        if (value === undefined || value === null || value === '') {
            return true;
        }
        if (value instanceof Date) {
            return false;
        }
        if (Array.isArray(value)) {
            return value.length === 0 || value.every((entry) => Guard.isEmpty(entry));
        }
        if (typeof value === 'object') {
            return Object.keys(value).length === 0;
        }
        return false;
    },

    lengthIsBetween(value: number | string | unknown[], min: number, max: number): boolean {
        if (Guard.isEmpty(value)) {
            throw new Error('Cannot check length of a value. Provided value is empty');
        }
        const valueLength = typeof value === 'number' ? value.toString().length : value.length;
        return valueLength >= min && valueLength <= max;
    },
};
