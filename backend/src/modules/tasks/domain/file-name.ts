import { ArgumentInvalidError } from '../../../shared/errors';

export const MAX_FILE_NAME_LENGTH = 255;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

export class InvalidFileNameError extends ArgumentInvalidError {}

/** Original name of an uploaded file: no path segments, no control characters, at most 255 characters. */
export class FileName {
    private constructor(readonly value: string) {}

    static of(raw: string): FileName {
        const withoutControl = raw.replace(CONTROL_CHARACTERS, '');
        const lastSegment = withoutControl.split(/[\\/]/).pop() ?? '';
        const value = lastSegment.trim();
        if (value.length === 0 || value === '.' || value === '..') {
            throw new InvalidFileNameError('File name must not be empty');
        }
        return new FileName(cut(value));
    }

    equals(other: FileName): boolean {
        return this.value === other.value;
    }
}

function cut(name: string): string {
    if (name.length <= MAX_FILE_NAME_LENGTH) return name;
    const dot = name.lastIndexOf('.');
    const extension = dot > 0 ? name.slice(dot) : '';
    if (extension.length === 0 || extension.length >= MAX_FILE_NAME_LENGTH) {
        return name.slice(0, MAX_FILE_NAME_LENGTH);
    }
    return name.slice(0, MAX_FILE_NAME_LENGTH - extension.length) + extension;
}
