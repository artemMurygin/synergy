import { z } from 'zod';
import { BASE_EDUCATIONS } from '../domain/value-objects/base-education';
import { CURRENCIES } from '../domain/value-objects/money';
import { ORGANIZATION_KINDS } from '../domain/value-objects/organization-kind';
import { PRICE_KINDS } from '../domain/value-objects/price-kind';
import { PROGRAM_LEVELS } from '../domain/value-objects/program-level';
import { PROGRAM_STATUSES } from '../domain/value-objects/program-status';
import { STUDY_FORMS } from '../domain/value-objects/study-form';
import { TARIFFS } from '../domain/value-objects/tariff';

/**
 * Контракт агента programs-etl: схема структурированного ответа (mutation plan) и системный промпт.
 *
 * Поля `data` каждой записи совпадают с полями, которые принимает CatalogWriterRepository
 * (camelCase), а допустимые значения enum — с CHECK-ограничениями миграций 005–007.
 * Любое расхождение должно ловиться тестом programs-agent-contract.spec.ts.
 */

/** Типы текстовых разделов программы (CHECK `content_chunk.section_type`, миграция 007). */
export const CONTENT_SECTION_TYPES = [
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

// ---------------------------------------------------------------------------
// Общие фрагменты схемы
// ---------------------------------------------------------------------------

const text = (description: string): z.ZodString => z.string().trim().min(1).describe(description);

const isoDate = (description: string): z.ZodString =>
    z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
        .describe(description);

/**
 * Ссылка на родителя: UUID существующей записи (только из catalog tools этого запуска)
 * либо `{ "ref": "<local_key>" }` на более раннюю операцию этого же плана.
 */
const parentRef = (description: string): z.ZodType<string | { ref: string }> =>
    z
        .union([z.uuid(), z.strictObject({ ref: z.string().min(1) })])
        .describe(`${description} UUID of an existing record or { "ref": "<local_key>" }.`);

const sectionSchema = z.strictObject({
    sectionType: z.enum(CONTENT_SECTION_TYPES),
    text: text('Section text copied verbatim from the sheet'),
});

// ---------------------------------------------------------------------------
// Поля записей (`data`). Все поля необязательны в схеме; обязательность для `create`
// проверяется ниже (REQUIRED_ON_CREATE), чтобы `update` мог менять отдельные поля.
// ---------------------------------------------------------------------------

const organizationData = z.strictObject({
    kind: z.enum(ORGANIZATION_KINDS).describe('Organization kind. Natural key with name.'),
    name: text('Organization name. Natural key with kind.'),
    parentId: parentRef('Parent organization, e.g. the university for a branch.'),
    hasOwnRequisites: z.boolean().describe('The organization has its own payment requisites.'),
});

const facultyData = z.strictObject({
    organizationId: parentRef('Owning organization. Natural key with name.'),
    name: text('Faculty name. Natural key with organizationId.'),
});

const locationData = z.strictObject({
    organizationId: parentRef('Owning organization.'),
    city: text('City'),
    metro: z.string().describe('Metro station'),
    address: z.string().describe('Street address'),
});

const programData = z.strictObject({
    organizationId: parentRef('Organization that runs the program.'),
    facultyId: parentRef('Faculty of the program.'),
    level: z.enum(PROGRAM_LEVELS).describe('Education level.'),
    title: text('Program title.'),
    directionCode: z.string().describe('Direction/speciality code, e.g. 09.03.01.'),
    profile: z.string().describe('Profile of the direction.'),
    qualification: z.string().describe('Awarded qualification.'),
    isStateFunded: z.boolean().describe('Budget (state funded) places exist.'),
    isAccredited: z.boolean().describe('State accredited program.'),
    status: z.enum(PROGRAM_STATUSES).describe('Enrollment status.'),
    crmName: z.string().describe('Program name in the CRM.'),
    crmProductGroup: z.string().describe('Product group in the CRM.'),
    sections: z
        .array(sectionSchema)
        .describe(
            'Descriptive texts of the program. Never summarize: copy the text from the sheet. ' +
                'Allowed sectionType values: ' +
                CONTENT_SECTION_TYPES.join(', '),
        ),
});

const offerData = z.strictObject({
    programId: parentRef('Program the offer belongs to.'),
    locationId: parentRef('Location where the offer is delivered.'),
    studyForm: z.enum(STUDY_FORMS).describe('Form of study.'),
    baseEducation: z.enum(BASE_EDUCATIONS).describe('Education the applicant already has.'),
    tariff: z.enum(TARIFFS).describe('Tariff of the offer.'),
    schedule: z.string().describe('Schedule description.'),
    durationMonths: z.number().int().positive().describe('Duration in months.'),
    hours: z.number().int().positive().describe('Total academic hours.'),
    startDate: isoDate('Start date, YYYY-MM-DD.'),
    enrollUntil: isoDate('Enrollment deadline, YYYY-MM-DD.'),
    validTo: isoDate('Offer valid until, YYYY-MM-DD.'),
    notes: z.string().describe('Free-form notes of the offer.'),
});

const priceData = z.strictObject({
    offerId: parentRef('Offer the price belongs to.'),
    kind: z.enum(PRICE_KINDS).describe('Meaning of the price.'),
    amount: z.number().nonnegative().describe('Amount as a number without currency or spaces.'),
    currency: z.enum(CURRENCIES).describe('Currency code.'),
    condition: z.string().describe('Condition of the price. Required when kind is "discounted".'),
});

const entranceRequirementData = z.strictObject({
    programId: parentRef('Program the requirement belongs to.'),
    baseEducation: z.enum(BASE_EDUCATIONS).describe('Education level the requirement applies to.'),
    subject: text('Exam subject'),
    minScore: z.number().int().nonnegative().describe('Minimal score.'),
    isRequired: z.boolean().describe('The subject is mandatory.'),
});

/** Поля, без которых `create` не пройдёт NOT NULL/CHECK ограничения таблицы. */
const REQUIRED_ON_CREATE = {
    organization: ['kind', 'name'],
    faculty: ['organizationId', 'name'],
    location: ['organizationId', 'city'],
    program: ['organizationId', 'level', 'title'],
    offer: ['programId', 'studyForm', 'baseEducation'],
    price: ['offerId', 'kind', 'amount', 'currency'],
    entrance_requirement: ['programId', 'baseEducation', 'subject'],
} as const;

// ---------------------------------------------------------------------------
// Операция плана
// ---------------------------------------------------------------------------

const sourceReference = z.strictObject({
    source_id: z
        .string()
        .min(1)
        .describe(
            'source_id exactly as returned by list_group_sources, e.g. "<spreadsheet_id>:<sheet_id>".',
        ),
    row_numbers: z
        .array(z.number().int().positive())
        .min(1)
        .describe('1-based row numbers of the source sheet the record was derived from.'),
    ranges: z.array(z.string()).optional().describe('Optional A1 ranges, e.g. "A5:K5".'),
});

// Return type is inferred on purpose: the literal record_type feeds the discriminated union.
/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-unnecessary-type-parameters */
function operation<T extends keyof typeof REQUIRED_ON_CREATE, S extends z.ZodObject<z.ZodRawShape>>(
    recordType: T,
    data: S,
) {
    return z
        .strictObject({
            kind: z.enum(['create', 'update']),
            record_type: z.literal(recordType),
            record_id: z
                .string()
                .min(1)
                .optional()
                .describe(
                    'Required for "update": id of the record found with the catalog tools in this run. Forbidden for "create".',
                ),
            local_key: z
                .string()
                .min(1)
                .optional()
                .describe(
                    'Name of this record inside the plan. Set it when later operations point at this record with { "ref": "<local_key>" }.',
                ),
            data: data.partial(),
            sources: z.array(sourceReference).min(1),
        })
        .superRefine((op, ctx) => {
            const values = op.data as Record<string, unknown>;
            if (op.kind === 'create') {
                for (const field of REQUIRED_ON_CREATE[recordType]) {
                    if (values[field] === undefined) {
                        ctx.addIssue({
                            code: 'custom',
                            path: ['data', field],
                            message: `"${field}" is required to create ${recordType}`,
                        });
                    }
                }
                if (op.record_id !== undefined) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['record_id'],
                        message: 'record_id must not be set for "create"',
                    });
                }
            } else if (op.record_id === undefined) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['record_id'],
                    message: 'record_id is required for "update"',
                });
            }
            if (
                recordType === 'price' &&
                values.kind === 'discounted' &&
                (values.condition === undefined ||
                    values.condition === null ||
                    values.condition === '')
            ) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['data', 'condition'],
                    message: 'condition is required when price kind is "discounted"',
                });
            }
            if (recordType !== 'program' && 'sections' in values) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['data', 'sections'],
                    message: 'sections belong to program operations only',
                });
            }
        });
}

/* eslint-enable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-unnecessary-type-parameters */

/** Структурированный ответ агента: упорядоченный список операций (родители раньше детей). */
export const mutationPlanSchema = z.strictObject({
    operations: z
        .array(
            z.discriminatedUnion('record_type', [
                operation('organization', organizationData),
                operation('faculty', facultyData),
                operation('location', locationData),
                operation('program', programData),
                operation('offer', offerData),
                operation('price', priceData),
                operation('entrance_requirement', entranceRequirementData),
            ]),
        )
        .describe(
            'Ordered operations. A parent operation must come before the operations that reference it.',
        ),
});

export type MutationPlanResponse = z.infer<typeof mutationPlanSchema>;

// ---------------------------------------------------------------------------
// Системный промпт
// ---------------------------------------------------------------------------

const list = (values: readonly string[]): string => values.join(' | ');

/** System prompt of the programs ETL agent. Group and changed sources are passed in the user message. */
export const PROGRAMS_AGENT_SYSTEM_PROMPT = `You synchronize university program data from Google Sheets into an existing catalog.

You work on exactly one group of sheets. Use only the provided read-only tools:
list_group_sources, read_sheet_range, search_catalog_records, get_catalog_record, list_source_records.

## Workflow
1. Call list_group_sources. Each source has a "role" (for example "catalog" holds the program rows and prices, "content" holds descriptive texts). The roles and the group note are hints, not a fixed route. The group also lists "organizations": the organization(s) that own the programs of this group. This is authoritative configuration: the sheets themselves usually do not name the organization.
2. Read the changed sources with read_sheet_range in bounded ranges. If a result is truncated, continue with next_range. Read the other sheets of the group when you need them to complete a record.
3. For every record you are going to write, look for an existing one first: list_source_records (records previously taken from this sheet or row), then search_catalog_records. Search criteria are limited to the natural-key fields of each record type; an unknown criterion returns an error listing the supported ones.
4. Return the final result as the structured mutation plan.

## Mutation plan
- Only "create" and "update" operations exist. Never delete or archive: a record missing from the sheet is simply not mentioned.
- "update": set record_id to an id returned by the catalog tools in this run and put only the changed fields in data. "create": do not set record_id and fill every required field.
- Order operations so that a parent comes before its children: organization -> faculty / location -> program -> offer -> price; program -> entrance_requirement.
- To point at a record created earlier in the same plan, give it a local_key and reference it as { "ref": "<local_key>" } in the child's parent field. To point at an existing record use its UUID from the catalog tools.
- Every operation lists its provenance in "sources": the source_id from list_group_sources and the 1-based row numbers (and optionally A1 ranges) the record was derived from. A record built from several sheets lists every sheet and row it used.
- One sheet row may produce several records (a program, its offers and prices).
- Organization: every program needs organizationId. Take the organization from the group's "organizations" (kind + name, exactly as given); never invent a different one. Find it with search_catalog_records (record_type organization, criteria kind and name). If it exists, use its UUID; if not, create it as the first operation with a local_key and reference it with { "ref": "<local_key>" }. When the group lists several organizations, use each one's "hint" to decide which organization a row belongs to; if you cannot tell, skip the row. An organization with "parent_name" has its parent among the same list (the entry with that name): find or create the parent first and set parentId on the child. An entry whose hint says it is only a parent owns no programs of this group: create it if it is missing, but never attach programs to it. If the group lists no organizations, do not create programs.

## Record fields (data uses these camelCase keys only; unknown keys are rejected)
- organization: kind (${list(ORGANIZATION_KINDS)}), name [required to create: kind, name]; optional parentId, hasOwnRequisites.
- faculty: organizationId, name [required: both].
- location: organizationId, city [required]; optional metro, address.
- program: organizationId, level (${list(PROGRAM_LEVELS)}), title [required]; optional facultyId, directionCode, profile, qualification, isStateFunded, isAccredited, status (${list(PROGRAM_STATUSES)}), crmName, crmProductGroup, sections.
  sections = [{ sectionType (${list(CONTENT_SECTION_TYPES)}), text }]: descriptive texts of the program, copied verbatim, paragraph breaks kept; never paraphrase or shorten them.
- offer: programId, studyForm (${list(STUDY_FORMS)}), baseEducation (${list(BASE_EDUCATIONS)}) [required]; optional locationId, tariff (${list(TARIFFS)}), schedule, durationMonths, hours, startDate, enrollUntil, validTo (YYYY-MM-DD), notes.
- price: offerId, kind (${list(PRICE_KINDS)}), amount (number), currency (${list(CURRENCIES)}) [required]; optional condition. condition is mandatory when kind is "discounted".
- entrance_requirement: programId, baseEducation (${list(BASE_EDUCATIONS)}), subject [required]; optional minScore, isRequired.

Natural keys (used to avoid duplicates): organization = kind + name; faculty = organizationId + name; location = organizationId + city + metro + address; program = organizationId + level + directionCode + profile + qualification (or organizationId + level + title when there is no directionCode); offer = programId + locationId + studyForm + baseEducation + tariff; price = offerId + kind + condition; entrance_requirement = programId + baseEducation + subject. Writing the same natural key again updates the record instead of duplicating it.

## Data rules
- Copy values exactly as they appear in the sheets; do not invent, guess or translate data. If a required value is not in the sheets, skip that record instead of making it up.
- Enum fields accept only the listed values; map the wording of the sheet to the closest listed value only when the meaning is unambiguous, otherwise omit the optional field or skip the record.
- Amounts are plain numbers (no spaces, currency signs or thousands separators). Use the currency stated in the sheet.
- Do not create records for things the catalog cannot represent: for example FAQ that is not tied to a program, or links between a program and an alternative course. Leave such data out.
- If a tool returns an error, fix the request when possible; otherwise leave that data out.
- If nothing in the changed sheets maps to the catalog, return an empty operations list.`;
