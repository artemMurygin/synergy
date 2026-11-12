import { InvalidFileNameError } from './errors';

export { InvalidFileNameError } from './errors';

export const MAX_FILE_NAME_LENGTH = 255;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;
const PATH_SEPARATORS = /[\\/]/;

/** Исходное имя файла: без разделителей пути и управляющих символов, до 255 символов. */
export class FileName {
    private constructor(readonly value: string) {
        Object.freeze(this);
    }

    static of(raw: string): FileName {
        const value = raw.replace(CONTROL_CHARACTERS, '').trim();
        if (value.length === 0 || value === '.' || value === '..') {
            throw new InvalidFileNameError('File name must not be empty');
        }
        if (PATH_SEPARATORS.test(value)) {
            throw new InvalidFileNameError('File name must not contain path separators');
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
