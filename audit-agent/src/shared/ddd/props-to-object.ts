interface Unpackable {
    unpack(): unknown;
}

interface Convertible {
    toObject(): unknown;
}

function isUnpackable(value: unknown): value is Unpackable {
    return typeof value === 'object' && value !== null && 'unpack' in value;
}

function isConvertible(value: unknown): value is Convertible {
    return typeof value === 'object' && value !== null && 'toObject' in value;
}

function toPlainValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((entry: unknown) => toPlainValue(entry));
    }
    if (isUnpackable(value)) {
        return value.unpack();
    }
    if (isConvertible(value)) {
        return value.toObject();
    }
    return value;
}

export function convertPropsToObject(props: object): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(props).map(([key, value]: [string, unknown]) => [key, toPlainValue(value)]),
    );
}
