export class SuspiciousExportError extends Error {
    readonly code = 'SUSPICIOUS_EXPORT';

    constructor(previous: number, current: number, threshold: number) {
        super(
            `Recognized rows dropped from ${String(previous)} to ${String(current)}, below ${String(threshold)}`,
        );
        this.name = 'SuspiciousExportError';
    }
}

export class EmptyExportGuard {
    assertSafe(
        previousRowCount: number,
        currentRecognizedRowCount: number,
        threshold: number,
    ): void {
        if (
            !Number.isInteger(previousRowCount) ||
            previousRowCount < 0 ||
            !Number.isInteger(currentRecognizedRowCount) ||
            currentRecognizedRowCount < 0
        ) {
            throw new Error('Invalid row count');
        }
        if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
            throw new Error('Invalid threshold');
        if (previousRowCount > 0 && currentRecognizedRowCount < previousRowCount * threshold) {
            throw new SuspiciousExportError(previousRowCount, currentRecognizedRowCount, threshold);
        }
    }
}
