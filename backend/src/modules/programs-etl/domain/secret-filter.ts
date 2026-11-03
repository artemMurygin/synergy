import { createSanitizedSheet } from './value-objects';

export interface ReadSheet {
    headers: readonly string[];
    rows: readonly { rowNo: number; cells: readonly string[] }[];
}

const SECRET_HEADER =
    /(логин|парол|password|login|токен|token|плат[её]ж|ссылка\s*на\s*оплат|демо.?доступ)/iu;
const SECRET_QUERY = /[?&](?:token|password|pwd|key|api[_-]?key|secret)=/iu;
const PAYMENT_LINK =
    /^https?:\/\/(?:[^/]*\.)?(?:pay|payment|checkout|tinkoff|yookassa|cloudpayments)\.[^/]+/iu;

function isSecretValue(value: string): boolean {
    return SECRET_QUERY.test(value) || PAYMENT_LINK.test(value);
}

export class SecretFilter {
    sanitize(input: ReadSheet): {
        readonly sheet: ReturnType<typeof createSanitizedSheet>;
        readonly headers: readonly string[];
        readonly excludedColumns: number;
        readonly excludedCells: number;
    } {
        const kept = input.headers
            .map((header, index) => ({ header, index }))
            .filter(({ header }) => !SECRET_HEADER.test(header));
        const excludedColumns = input.headers.length - kept.length;
        let excludedCells = 0;
        const rows = input.rows.map((row) => ({
            rowNo: row.rowNo,
            cells: kept.map(({ index }) => {
                const value = row.cells[index] ?? '';
                if (isSecretValue(value)) {
                    excludedCells++;
                    return '';
                }
                return value;
            }),
        }));
        return Object.freeze({
            sheet: createSanitizedSheet(rows),
            headers: Object.freeze(kept.map(({ header }) => header)),
            excludedColumns,
            excludedCells,
        });
    }
}

export type SanitizationResult = ReturnType<SecretFilter['sanitize']>;
