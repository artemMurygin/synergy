import {
    BASE_EDUCATIONS,
    PROGRAM_LEVELS,
    SECTION_TYPES,
    STUDY_FORMS,
    createParsedSheet,
    createPriceCell,
    createSheetMap,
    type BaseEducation,
    type Currency,
    type ProgramLevel,
    type SanitizedSheet,
    type SectionType,
    type StudyForm,
} from './value-objects';

export const PRICE_KINDS = [
    'first_year',
    'next_year',
    'total',
    'installment',
    'lump_sum',
    'site_price',
    'discounted',
] as const;
export type PriceKind = (typeof PRICE_KINDS)[number];

type OrganizationKind = 'university' | 'college' | 'branch' | 'academy' | 'partner' | 'school';
type Tariff = 'base' | 'optima' | 'premium';

export interface ParserColumn {
    index: number;
    role:
        | 'title'
        | 'direction_code'
        | 'qualification'
        | 'profile'
        | 'hours'
        | 'duration'
        | 'offer'
        | 'text'
        | 'requirement';
    studyForm?: StudyForm;
    baseEducation?: BaseEducation;
    sectionType?: SectionType;
    priceKinds?: readonly PriceKind[];
    tariff?: Tariff;
    startDate?: string;
}

export interface ParserSheetMap {
    type: string;
    organization: { kind: OrganizationKind; name: string };
    level: ProgramLevel;
    columns: readonly ParserColumn[];
    headingRows?: readonly {
        rowNo: number;
        faculty?: string;
        city?: string;
        address?: string;
        metro?: string;
    }[];
}

export interface ParsedPrice {
    kind: PriceKind;
    amount: number;
    currency: Currency;
}

export interface ParsedOffer {
    studyForm: StudyForm;
    baseEducation: BaseEducation;
    tariff: Tariff | null;
    startDate: string | null;
    durationMonths: number | null;
    hours: number | null;
    sourceRowNo: number;
    prices: ParsedPrice[];
}

export interface ParsedSection {
    sectionType: SectionType;
    text: string;
    sourceRowNo: number;
}

export interface ParsedRequirement {
    baseEducation: BaseEducation;
    subject: string;
    sourceRowNo: number;
}

export interface ParsedProgram {
    programKey: string;
    organization: ParserSheetMap['organization'];
    level: ProgramLevel;
    title: string;
    directionCode: string | null;
    qualification: string | null;
    profile: string | null;
    faculty: string | null;
    location: { city: string | null; address: string | null; metro: string | null } | null;
    sourceRowNo: number;
    offers: ParsedOffer[];
    sections: ParsedSection[];
    requirements: ParsedRequirement[];
}

export interface ParsedSheet {
    programs: readonly ParsedProgram[];
    offers: readonly ParsedOffer[];
    prices: readonly ParsedPrice[];
    requirements: readonly ParsedRequirement[];
    referenceRecords: readonly unknown[];
    warnings: readonly { rowNo: number; code: 'UNPARSEABLE_PRICE' | 'UNPARSEABLE_ROW' }[];
    sourceRows: readonly number[];
}

const DURATION_PATTERN = /(?:(\d+)\s*г(?:од(?:а|ов)?)?\.?\s*)?(\d+)\s*мес(?:яц(?:а|ев)?)?\.?/iu;
const YEARS_PATTERN = /(\d+)\s*г(?:од(?:а|ов)?)?\.?/iu;
const HOURS_PATTERN = /(\d+)\s*(?:академических\s*)?(?:час(?:а|ов)?|ч)(?=\s|$|[.,;])/iu;
const DATE_PATTERN = /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/gu;
const MONEY_PATTERN = /(?:\d{1,3}(?:[\s\u00a0\u202f]\d{3})+|\d{4,8})(?:[.,]\d{1,2})?/gu;
const DIRECTION_CODE_PATTERN = /\b\d{2}\.\d{2}\.\d{2}\b/u;

function durationMonths(text: string): number | undefined {
    const monthMatch = DURATION_PATTERN.exec(text);
    if (monthMatch) {
        const years = Number(monthMatch[1]);
        const value = (Number.isNaN(years) ? 0 : years) * 12 + Number(monthMatch[2]);
        return value > 0 ? value : undefined;
    }
    const yearMatch = YEARS_PATTERN.exec(text);
    return yearMatch ? Number(yearMatch[1]) * 12 : undefined;
}

function hours(text: string): number | undefined {
    const match = HOURS_PATTERN.exec(text);
    return match ? Number(match[1]) : undefined;
}

export function parsePriceCell(text: string): ReturnType<typeof createPriceCell> {
    const duration = durationMonths(text);
    const withoutDuration = text.replace(DURATION_PATTERN, ' ').replace(YEARS_PATTERN, ' ');
    const withoutHours = withoutDuration.replace(HOURS_PATTERN, ' ').replace(DATE_PATTERN, ' ');
    const amounts = [...withoutHours.matchAll(MONEY_PATTERN)].map((match) =>
        Number(match[0].replace(/[\s\u00a0\u202f]/gu, '').replace(',', '.')),
    );
    const currency: Currency = /(?:\$|USD)/iu.test(text)
        ? 'USD'
        : /(?:€|EUR)/iu.test(text)
          ? 'EUR'
          : 'RUB';
    return createPriceCell({ amounts, durationMonths: duration, currency, sourceText: text });
}

function cell(cells: readonly string[], index: number): string {
    return (cells[index] ?? '').trim();
}

function assertMap(map: ParserSheetMap, sheet: SanitizedSheet): void {
    if (map.type !== 'programs') throw new Error('Unsupported sheet map type');
    if (!PROGRAM_LEVELS.includes(map.level)) throw new Error('Invalid level');
    if (
        !['university', 'college', 'branch', 'academy', 'partner', 'school'].includes(
            map.organization.kind,
        )
    )
        throw new Error('Invalid organization kind');
    if (!map.organization.name.trim()) throw new Error('Invalid organization name');
    const columnCount = Math.max(0, ...sheet.rows.map((row) => row.cells.length));
    createSheetMap(map, columnCount);
    if (map.columns.filter((column) => column.role === 'title').length !== 1)
        throw new Error('Exactly one title column is required');
    const seen = new Set<number>();
    for (const column of map.columns) {
        if (seen.has(column.index)) throw new Error('Duplicate mapped column');
        seen.add(column.index);
        if (column.role === 'offer') {
            if (!column.studyForm || !STUDY_FORMS.includes(column.studyForm))
                throw new Error('Invalid study form');
            if (!column.baseEducation || !BASE_EDUCATIONS.includes(column.baseEducation))
                throw new Error('Invalid base education');
            if (column.priceKinds?.some((kind) => !PRICE_KINDS.includes(kind)) === true)
                throw new Error('Invalid price kind');
            if (column.priceKinds && new Set(column.priceKinds).size !== column.priceKinds.length)
                throw new Error('Duplicate price kind');
            if (column.tariff && !['base', 'optima', 'premium'].includes(column.tariff))
                throw new Error('Invalid tariff');
        }
        if (
            column.role === 'text' &&
            (!column.sectionType || !SECTION_TYPES.includes(column.sectionType))
        )
            throw new Error('Invalid section type');
        if (
            column.role === 'requirement' &&
            column.baseEducation &&
            !BASE_EDUCATIONS.includes(column.baseEducation)
        )
            throw new Error('Invalid base education');
    }
    for (const heading of map.headingRows ?? []) {
        if (!Number.isInteger(heading.rowNo) || heading.rowNo < 1)
            throw new Error('Invalid heading row');
    }
}

export class SheetParser {
    parse(sheet: SanitizedSheet, map: ParserSheetMap): ParsedSheet {
        assertMap(map, sheet);
        const programs: ParsedProgram[] = [];
        const warnings: ParsedSheet['warnings'][number][] = [];
        const sourceRows: number[] = [];
        const mappedHeadings = new Map(
            (map.headingRows ?? []).map((heading) => [heading.rowNo, heading]),
        );
        let faculty: string | null = null;
        let location: ParsedProgram['location'] = null;
        const titleColumn = map.columns.find((column) => column.role === 'title');
        if (!titleColumn) throw new Error('Title column is required');

        for (const row of sheet.rows) {
            const heading = mappedHeadings.get(row.rowNo);
            if (heading) {
                if (heading.faculty !== undefined) faculty = heading.faculty.trim() || null;
                if (
                    heading.city !== undefined ||
                    heading.address !== undefined ||
                    heading.metro !== undefined
                )
                    location = {
                        city: heading.city?.trim() ?? null,
                        address: heading.address?.trim() ?? null,
                        metro: heading.metro?.trim() ?? null,
                    };
                continue;
            }
            const titleCell = cell(row.cells, titleColumn.index);
            if (!titleCell) {
                if (row.cells.some((value) => value.trim()))
                    warnings.push({ rowNo: row.rowNo, code: 'UNPARSEABLE_ROW' });
                continue;
            }
            const codeColumn = map.columns.find((column) => column.role === 'direction_code');
            const code =
                (codeColumn
                    ? DIRECTION_CODE_PATTERN.exec(cell(row.cells, codeColumn.index))?.[0]
                    : undefined) ??
                DIRECTION_CODE_PATTERN.exec(titleCell)?.[0] ??
                null;
            const title = titleCell
                .replace(DIRECTION_CODE_PATTERN, '')
                .replace(/\s+/gu, ' ')
                .trim();
            if (!title) {
                warnings.push({ rowNo: row.rowNo, code: 'UNPARSEABLE_ROW' });
                continue;
            }
            const qualification = map.columns.find((column) => column.role === 'qualification');
            const profile = map.columns.find((column) => column.role === 'profile');
            const hoursColumn = map.columns.find((column) => column.role === 'hours');
            const durationColumn = map.columns.find((column) => column.role === 'duration');
            const rowHours = hoursColumn ? hours(cell(row.cells, hoursColumn.index)) : undefined;
            const rowDuration = durationColumn
                ? durationMonths(cell(row.cells, durationColumn.index))
                : undefined;
            const offers: ParsedOffer[] = [];
            let invalidPrice = false;
            for (const column of map.columns.filter((entry) => entry.role === 'offer')) {
                if (column.studyForm === undefined || column.baseEducation === undefined)
                    throw new Error('Invalid offer map');
                const value = cell(row.cells, column.index);
                if (!value) continue;
                try {
                    const parsed = parsePriceCell(value);
                    const kinds = column.priceKinds ?? ['first_year', 'next_year'];
                    if (parsed.amounts.length > kinds.length)
                        throw new Error('More prices than mapped kinds');
                    offers.push({
                        studyForm: column.studyForm,
                        baseEducation: column.baseEducation,
                        tariff: column.tariff ?? null,
                        startDate: column.startDate ?? null,
                        durationMonths: parsed.durationMonths ?? rowDuration ?? null,
                        hours: rowHours ?? hours(value) ?? null,
                        sourceRowNo: row.rowNo,
                        prices: parsed.amounts.map((amount, index) => ({
                            kind: kinds[index],
                            amount,
                            currency: parsed.currency,
                        })),
                    });
                } catch {
                    invalidPrice = true;
                    break;
                }
            }
            if (invalidPrice) {
                warnings.push({ rowNo: row.rowNo, code: 'UNPARSEABLE_PRICE' });
                continue;
            }
            const sections = map.columns
                .filter((column) => column.role === 'text')
                .flatMap((column) =>
                    column.sectionType === undefined
                        ? []
                        : [
                              {
                                  sectionType: column.sectionType,
                                  text: cell(row.cells, column.index),
                                  sourceRowNo: row.rowNo,
                              },
                          ],
                )
                .filter((section) => section.text);
            const requirements = map.columns
                .filter((column) => column.role === 'requirement')
                .map((column) => ({
                    baseEducation: column.baseEducation ?? 'any',
                    subject: cell(row.cells, column.index),
                    sourceRowNo: row.rowNo,
                }))
                .filter((requirement) => requirement.subject);
            if (!offers.length && !sections.length && !requirements.length) {
                warnings.push({ rowNo: row.rowNo, code: 'UNPARSEABLE_ROW' });
                continue;
            }
            const parsedQualification = qualification
                ? cell(row.cells, qualification.index) || null
                : null;
            const parsedProfile = profile ? cell(row.cells, profile.index) || null : null;
            programs.push({
                programKey: [
                    map.organization.kind,
                    map.organization.name,
                    map.level,
                    code ?? title,
                    parsedProfile ?? '',
                    parsedQualification ?? '',
                ].join('|'),
                organization: map.organization,
                level: map.level,
                title,
                directionCode: code,
                qualification: parsedQualification,
                profile: parsedProfile,
                faculty,
                location,
                sourceRowNo: row.rowNo,
                offers,
                sections,
                requirements,
            });
            sourceRows.push(row.rowNo);
        }
        return createParsedSheet({
            programs,
            offers: programs.flatMap((program) => program.offers),
            prices: programs.flatMap((program) => program.offers.flatMap((offer) => offer.prices)),
            requirements: programs.flatMap((program) => program.requirements),
            referenceRecords: [],
            warnings,
            sourceRows,
        });
    }
}
