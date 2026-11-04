import { ProgramsSyncError } from '../errors/programs-sync.error';

/** Hash of observed or last successfully processed sheet content. */
export interface SourceFingerprint {
    readonly value: string;
}

/** Changed sheet version carried by a scan job. */
export interface ChangedSource {
    readonly sourceId: string;
    readonly observedHash: string;
}

/** Neutral provenance reference: no raw_row and no SDK types. */
export interface SourceReference {
    readonly sourceId: string;
    readonly rowNumbers: readonly number[];
    readonly ranges?: readonly string[];
}

export function createSourceFingerprint(value: string): SourceFingerprint {
    if (value.length === 0) {
        throw new ProgramsSyncError(
            'INVALID_WORKFLOW_DATA',
            'Source fingerprint must not be empty',
        );
    }
    return { value };
}

export function createSourceReference(input: {
    sourceId: string;
    rowNumbers: readonly number[];
    ranges?: readonly string[];
}): SourceReference {
    for (const row of input.rowNumbers) {
        if (!Number.isInteger(row) || row < 1) {
            throw new ProgramsSyncError(
                'INVALID_WORKFLOW_DATA',
                `Row number must be a positive integer: ${String(row)}`,
            );
        }
    }
    const rowNumbers = [...new Set(input.rowNumbers)].sort((a, b) => a - b);
    return input.ranges === undefined
        ? { sourceId: input.sourceId, rowNumbers }
        : { sourceId: input.sourceId, rowNumbers, ranges: [...input.ranges] };
}
