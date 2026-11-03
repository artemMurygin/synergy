import { describe, expect, it } from 'vitest';
import { EmptyExportGuard, SuspiciousExportError } from './empty-export-guard';

describe('EmptyExportGuard', () => {
    const guard = new EmptyExportGuard();
    it('allows first import', () => {
        expect(() => {
            guard.assertSafe(0, 0, 0.5);
        }).not.toThrow();
    });
    it('allows exact 50 percent boundary', () => {
        expect(() => {
            guard.assertSafe(10, 5, 0.5);
        }).not.toThrow();
    });
    it('rejects a suspicious loss of recognized rows', () => {
        expect(() => {
            guard.assertSafe(10, 4, 0.5);
        }).toThrow(SuspiciousExportError);
    });
    it('validates threshold without mutating inputs', () => {
        expect(() => {
            guard.assertSafe(10, 9, 1.5);
        }).toThrow();
        expect(() => {
            guard.assertSafe(10, 9, 0.5);
        }).not.toThrow();
    });
});
