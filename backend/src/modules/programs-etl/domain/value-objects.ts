export const PROGRAM_LEVELS = [
    'spo',
    'bachelor',
    'specialist',
    'master',
    'postgrad',
    'dpo_pp',
    'dpo_pk',
    'short_course',
    'kids',
    'camp',
] as const;
export const STUDY_FORMS = [
    'full_time',
    'mixed',
    'extramural',
    'distance',
    'distance_tutor',
    'online',
] as const;
export const BASE_EDUCATIONS = ['grade9', 'grade11', 'spo', 'vo', 'any'] as const;
export const SECTION_TYPES = [
    'about',
    'curriculum',
    'careers',
    'course_goal',
    'usp',
    'faq',
    'people',
    'cases',
    'practice',
] as const;
export const CURRENCIES = ['RUB', 'USD', 'EUR'] as const;

export type ProgramLevel = (typeof PROGRAM_LEVELS)[number];
export type StudyForm = (typeof STUDY_FORMS)[number];
export type BaseEducation = (typeof BASE_EDUCATIONS)[number];
export type SectionType = (typeof SECTION_TYPES)[number];
export type Currency = (typeof CURRENCIES)[number];

function includes<T extends string>(values: readonly T[], value: string): value is T {
    return values.includes(value as T);
}

function required(value: string, field: string): string {
    if (!value.trim()) throw new Error(`${field} is required`);
    return value.trim();
}

export function createSheetIdentity(
    spreadsheetId: string,
    sheetId: number,
): Readonly<{ spreadsheetId: string; sheetId: number }> {
    if (!Number.isSafeInteger(sheetId) || sheetId < 0) throw new Error('Invalid sheetId');
    return Object.freeze({ spreadsheetId: required(spreadsheetId, 'spreadsheetId'), sheetId });
}

export interface SheetRow {
    rowNo: number;
    cells: readonly string[];
}
export function createSanitizedSheet(
    rows: readonly SheetRow[],
): Readonly<{ rows: readonly SheetRow[] }> {
    return Object.freeze({
        rows: Object.freeze(
            rows.map((row) => {
                if (!Number.isInteger(row.rowNo) || row.rowNo < 1) throw new Error('Invalid rowNo');
                return Object.freeze({ rowNo: row.rowNo, cells: Object.freeze([...row.cells]) });
            }),
        ),
    });
}
export type SanitizedSheet = ReturnType<typeof createSanitizedSheet>;

export interface SheetMapColumn {
    index: number;
    role: string;
    studyForm?: string;
    baseEducation?: string;
}
export function createSheetMap(
    input: { type: string; columns: readonly SheetMapColumn[] },
    columnCount: number,
): Readonly<{ type: string; columns: readonly SheetMapColumn[] }> {
    if (!Number.isInteger(columnCount) || columnCount < 0) throw new Error('Invalid column count');
    const columns = input.columns.map((column) => {
        if (!Number.isInteger(column.index) || column.index < 0 || column.index >= columnCount)
            throw new Error('Unknown column');
        if (column.studyForm !== undefined && !includes(STUDY_FORMS, column.studyForm))
            throw new Error('Invalid study form');
        if (column.baseEducation !== undefined && !includes(BASE_EDUCATIONS, column.baseEducation))
            throw new Error('Invalid base education');
        return Object.freeze({ ...column });
    });
    return Object.freeze({ type: required(input.type, 'type'), columns: Object.freeze(columns) });
}
export type SheetMap = ReturnType<typeof createSheetMap>;

export function createParsedSheet<
    T extends {
        programs: readonly unknown[];
        warnings: readonly unknown[];
        sourceRows: readonly number[];
    },
>(input: T): Readonly<T> {
    if (input.sourceRows.some((rowNo) => !Number.isInteger(rowNo) || rowNo < 1))
        throw new Error('Invalid source row');
    return Object.freeze({
        ...input,
        programs: Object.freeze([...input.programs]),
        warnings: Object.freeze([...input.warnings]),
        sourceRows: Object.freeze([...input.sourceRows]),
    });
}

export function createProgramNaturalKey(input: {
    organizationId: string;
    level: string;
    title: string;
    directionCode?: string | null;
    profile?: string | null;
    qualification?: string | null;
}): Readonly<{
    organizationId: string;
    level: ProgramLevel;
    title: string;
    directionCode: string | null;
    profile: string | null;
    qualification: string | null;
    kind: 'coded' | 'title';
}> {
    if (!includes(PROGRAM_LEVELS, input.level)) throw new Error('Invalid level');
    return Object.freeze({
        organizationId: required(input.organizationId, 'organizationId'),
        level: input.level,
        title: required(input.title, 'title'),
        directionCode: input.directionCode?.trim() ?? null,
        profile: input.profile?.trim() ?? null,
        qualification: input.qualification?.trim() ?? null,
        kind:
            input.directionCode !== undefined &&
            input.directionCode !== null &&
            input.directionCode.trim() !== ''
                ? ('coded' as const)
                : ('title' as const),
    });
}

export function createPriceCell(input: {
    amounts: readonly number[];
    durationMonths?: number;
    currency: string;
    sourceText: string;
}): Readonly<{
    amounts: readonly number[];
    durationMonths: number | undefined;
    currency: Currency;
    sourceText: string;
}> {
    if (
        !input.amounts.length ||
        input.amounts.some((amount) => !Number.isFinite(amount) || amount < 0)
    )
        throw new Error('Invalid amount');
    if (
        input.durationMonths !== undefined &&
        (!Number.isInteger(input.durationMonths) || input.durationMonths < 1)
    )
        throw new Error('Invalid duration');
    if (!includes(CURRENCIES, input.currency)) throw new Error('Invalid currency');
    return Object.freeze({
        amounts: Object.freeze([...input.amounts]),
        durationMonths: input.durationMonths,
        currency: input.currency,
        sourceText: required(input.sourceText, 'sourceText'),
    });
}

export function createChunkDraft(input: {
    programKey: string;
    sectionType: string;
    chunkNo: number;
    text: string;
    sourceRowNo: number;
}): Readonly<{
    programKey: string;
    sectionType: SectionType;
    chunkNo: number;
    text: string;
    sourceRowNo: number;
}> {
    if (!includes(SECTION_TYPES, input.sectionType)) throw new Error('Invalid section type');
    if (!Number.isInteger(input.chunkNo) || input.chunkNo < 0) throw new Error('Invalid chunkNo');
    if (!Number.isInteger(input.sourceRowNo) || input.sourceRowNo < 1)
        throw new Error('Invalid source row');
    return Object.freeze({
        programKey: required(input.programKey, 'programKey'),
        sectionType: input.sectionType,
        chunkNo: input.chunkNo,
        text: required(input.text, 'text'),
        sourceRowNo: input.sourceRowNo,
    });
}
