import { resolve } from 'node:path';

/** Inclusive range of rows (1-based). */
export type RowRange = readonly [number, number];

/** Cells of one column that the agent must never see (credentials, invitations, personal contacts). */
export interface HiddenCells {
    readonly column: string;
    readonly rows: readonly RowRange[];
}

export interface SheetLayout {
    /** Rows (1-based) that form the column header; the label of a column joins them. */
    readonly headerRows: readonly number[];
    /** First row with data or section headers. */
    readonly firstDataRow: number;
    /** Columns the agent must never see (e.g. credentials). */
    readonly hiddenColumns?: readonly string[];
    /** Single cells or blocks inside otherwise needed columns that the agent must never see. */
    readonly hiddenCells?: readonly HiddenCells[];
}

export interface ModelSetting {
    readonly name: string;
    /** `omniroute` uses OPENAI_BASE_URL and OPENAI_API_KEY, `openrouter` uses OPENROUTER_API_KEY. */
    readonly provider: 'omniroute' | 'openrouter';
    /** OpenRouter only: reasoning effort; low keeps the answers fast. */
    readonly reasoningEffort?: 'low' | 'medium' | 'high';
    /**
     * OpenRouter only: Anthropic prompt caching (off by default on Anthropic's side).
     * Adds top-level `cache_control`, so the prefix (tools, system prompt, history) is cached automatically.
     */
    readonly promptCache?: boolean;
}

/** Settings of the sheets-qa prototype. Secrets (OPENAI_API_KEY, OPENAI_BASE_URL, OPENROUTER_API_KEY) stay in env. */
export const SHEETS_QA_CONFIG = {
    /** Chat model used through the OpenAI-compatible endpoint (omniroute). */
    model: {
        name: 'anthropic/claude-haiku-5.5',
        provider: 'openrouter',
        reasoningEffort: 'low',
        promptCache: true,
    },
    /** Faster model of the subagents that search the price sheets. */
    subagentModel: {
        name: 'anthropic/claude-haiku-5.5',
        provider: 'openrouter',
        reasoningEffort: 'low',
        promptCache: true,
    },
    /** Folder with `catalog.md` (from the backend root, not dist). */
    dataDir: resolve(process.cwd(), 'src/modules/sheets-qa/data'),
    /** LangGraph recursion limit for one question. */
    maxSteps: 60,
    /** Time limit for one question, ms. */
    timeoutMs: 180_000,
    /** Limits that keep one tool answer below the Deep Agents offload threshold. */
    limits: {
        maxRowsPerRead: 15,
        maxSearchHits: 30,
        maxCellChars: 600,
        maxAnswerChars: 24_000,
    },
} as const;

/** Described sheets. Sheets without a layout are read with plain column letters. */
export const SHEET_LAYOUTS: Readonly<Partial<Record<string, SheetLayout>>> = {
    СПО: { headerRows: [4, 5], firstDataRow: 6 },
    'МБ СПО': { headerRows: [1], firstDataRow: 2 },
    'МБ квалификация': { headerRows: [1], firstDataRow: 2, hiddenColumns: ['I'] },
    БАКСПЦ: { headerRows: [4, 5, 6], firstDataRow: 7 },
    МАГ: { headerRows: [4, 5], firstDataRow: 6 },
    МВА: { headerRows: [3], firstDataRow: 4 },
    'МБ МАГ': { headerRows: [2], firstDataRow: 3 },
    'МБ АСП': { headerRows: [2], firstDataRow: 3 },
    'МБ МТИ': { headerRows: [2], firstDataRow: 3 },
    'МБ МАП': { headerRows: [1], firstDataRow: 2 },
    'МБ ЮФУБГИСПИГ': { headerRows: [1], firstDataRow: 2 },
    'МБ МВА': { headerRows: [1], firstDataRow: 2 },
    // K and O hold demo LMS logins and passwords (rows 36, 44, 46) next to knowledge-base links.
    'МБ БАК': { headerRows: [1], firstDataRow: 2, hiddenColumns: ['K', 'O'] },
};

/**
 * Relations the name matcher cannot find. Key and value are `<sheet>!<row>`;
 * an empty value means the row has no counterpart.
 */
export const RELATION_OVERRIDES: Readonly<Record<string, string>> = {
    'СПО!52': 'МБ СПО!36',
    'СПО!62': 'МБ СПО!45',
    'СПО!70': 'МБ СПО!41',
    'СПО!80': '',
};

/** Columns that hold the program name, to check that a link leads to the same program. */
export interface LinkTitleColumns {
    /** Columns of the price row (e.g. direction and profile). */
    readonly source: readonly string[];
    /** Columns of the target row. */
    readonly target: readonly string[];
}

export interface LinkRelationRule {
    /** Price sheet and the column whose hyperlink points to the related row. */
    readonly sheet: string;
    readonly column: string;
    /** Name of the relation reported by find_related. */
    readonly relation: string;
    /**
     * Sheet the link must lead to. Also used when the link names no sheet (Google exports some
     * links as `null!4:4`).
     */
    readonly targetSheet?: string;
    /**
     * Rows of the price sheet the rule applies to. Sheets with several blocks (college, bachelor,
     * master) use the same column for different things, so a rule is limited to its block.
     */
    readonly rows?: readonly RowRange[];
    /**
     * When set, a link whose target row has a different program name than the price row is still
     * reported, but with a note to verify it.
     */
    readonly title?: LinkTitleColumns;
}

/** Below this similarity of the program names a link is reported with a verification note. */
export const LINK_TITLE_MIN_SIMILARITY = 0.7;

/**
 * Hyperlinks of the price sheets that point to the related rows; the hyperlinks of the
 * workbook are the primary source of relations, name matching is only a fallback.
 * The titles of СПО and БАКСПЦ are not checked: their names differ from the methodical base
 * by design (a specialty includes several professions).
 */
export const LINK_RELATIONS: readonly LinkRelationRule[] = [
    { sheet: 'СПО', column: 'V', relation: 'methodical_base', targetSheet: 'МБ СПО' },
    {
        sheet: 'СПО',
        column: 'F',
        relation: 'qualification_project',
        targetSheet: 'МБ квалификация',
    },
    { sheet: 'БАКСПЦ', column: 'Z', relation: 'methodical_base', targetSheet: 'МБ БАК' },
    {
        sheet: 'БАКСПЦ',
        column: 'G',
        relation: 'qualification_project',
        targetSheet: 'МБ квалификация',
    },
    { sheet: 'БАКСПЦ', column: 'H', relation: 'profession', targetSheet: 'МБ ПО' },
    // Master: direction (D) and profile (E) against «Направление / Профиль» (C) of the base.
    {
        sheet: 'МАГ',
        column: 'R',
        relation: 'methodical_base',
        targetSheet: 'МБ МАГ',
        title: { source: ['D', 'E'], target: ['C'] },
    },
    {
        sheet: 'МАГ',
        column: 'G',
        relation: 'qualification_project',
        targetSheet: 'МБ квалификация',
    },
    // Postgraduate (rows 6-43) and residency (rows 48-49); H and I lead to the same row.
    ...['H', 'I'].map((column): LinkRelationRule => ({
        sheet: 'АСПОРД',
        column,
        relation: 'methodical_base',
        targetSheet: 'МБ АСП',
        rows: [
            [6, 43],
            [48, 49],
        ],
        title: { source: ['C'], target: ['C'] },
    })),
    {
        sheet: 'АСПОРД',
        column: 'E',
        relation: 'qualification_project',
        targetSheet: 'МБ квалификация',
        rows: [
            [6, 43],
            [48, 49],
        ],
    },
    // MTI: college (5-18), bachelor (26-112) and master (117-128) use different columns.
    {
        sheet: 'МТИ',
        column: 'M',
        relation: 'methodical_base',
        targetSheet: 'МБ МТИ',
        rows: [[5, 18]],
        title: { source: ['C'], target: ['C'] },
    },
    {
        sheet: 'МТИ',
        column: 'N',
        relation: 'methodical_base',
        targetSheet: 'МБ МТИ',
        rows: [[26, 112]],
        title: { source: ['C', 'D'], target: ['B', 'C'] },
    },
    {
        sheet: 'МТИ',
        column: 'H',
        relation: 'methodical_base',
        targetSheet: 'МБ МТИ',
        rows: [[117, 128]],
        title: { source: ['C', 'D'], target: ['B', 'C'] },
    },
    // MAP: college (7-26), bachelor (32-65) and master (72-79).
    {
        sheet: 'МАП',
        column: 'M',
        relation: 'methodical_base',
        targetSheet: 'МБ МАП',
        rows: [[7, 26]],
        title: { source: ['D'], target: ['B'] },
    },
    {
        sheet: 'МАП',
        column: 'O',
        relation: 'methodical_base',
        targetSheet: 'МБ МАП',
        rows: [[32, 65]],
        title: { source: ['D', 'E'], target: ['A', 'B'] },
    },
    {
        sheet: 'МАП',
        column: 'L',
        relation: 'methodical_base',
        targetSheet: 'МБ МАП',
        rows: [[72, 79]],
        title: { source: ['D', 'E'], target: ['A', 'B'] },
    },
    // Partner universities: the links are exported as `null!4:4`, the target is the rule's sheet.
    {
        sheet: 'ЮФУБГИСПИГ',
        column: 'G',
        relation: 'methodical_base',
        targetSheet: 'МБ ЮФУБГИСПИГ',
        title: { source: ['B'], target: ['B'] },
    },
];

/** Sheets that Google Sheets hyperlinks name by `gid` (the id is not stored in the workbook). */
export const SHEET_GIDS: Readonly<Partial<Record<string, string>>> = {
    '1816278612': 'МБ квалификация',
    // Links G27 and G29 of ЮФУБГИСПИГ (rows 3 and 2: Менеджмент and Экономика of БГИ).
    '1403731608': 'МБ ЮФУБГИСПИГ',
};

/** Folder with the workbooks, their structure files and sheet guides (from the backend root, not dist). */
const TABLES_DIR = resolve(process.cwd(), 'src/modules/sheets-qa/data/tables');

export interface BookConfig {
    /** Book name as the agent passes it in the `book` argument of the tools. */
    readonly id: string;
    /** One line for the agent: what the book holds and when to read it. */
    readonly description: string;
    /** The exported workbook the agent reads. */
    readonly workbookFile: string;
    /** Structure of the workbook (the index of its sheets), next to the workbook. */
    readonly structureFile: string;
    /** Guides of the workbook sheets: one `<sheet name>.md` per sheet. */
    readonly guidesDir: string;
    readonly layouts: Readonly<Partial<Record<string, SheetLayout>>>;
    readonly overrides: Readonly<Record<string, string>>;
    readonly linkRules: readonly LinkRelationRule[];
    readonly gids: Readonly<Partial<Record<string, string>>>;
    /**
     * Sheets whose guide file is named differently: sheet name in the workbook (Google truncates
     * names to 31 characters) mapped to the guide file name without `.md`.
     */
    readonly guideAliases?: Readonly<Record<string, string>>;
}

function book(
    id: string,
    workbook: string,
    description: string,
    extra: Partial<BookConfig> = {},
): BookConfig {
    return {
        id,
        description,
        workbookFile: resolve(TABLES_DIR, workbook),
        structureFile: resolve(TABLES_DIR, `${id}.md`),
        guidesDir: resolve(TABLES_DIR, id),
        layouts: {},
        overrides: {},
        linkRules: [],
        gids: {},
        ...extra,
    };
}

/** Hidden blocks of one column: `hide('B', [187, 197])`. */
function hide(column: string, ...rows: RowRange[]): HiddenCells {
    return { column, rows };
}

/** The same hidden block in several columns. */
function hideColumns(columns: readonly string[], ...rows: RowRange[]): HiddenCells[] {
    return columns.map((column) => hide(column, ...rows));
}

// Layouts below were taken from the workbooks; keys are sheet names without edge spaces.
// Hidden cells: credentials, invitations to closed chats and personal contacts inside needed columns.
const DPO_RB_LAYOUTS: Readonly<Record<string, SheetLayout>> = {
    'Реестр ДРБ': { headerRows: [3], firstDataRow: 4 },
    'Реестр ОБЩИЙ с классификацией (': {
        headerRows: [1],
        firstDataRow: 2,
        // Contacts of the holders (phone, e-mail, Telegram).
        hiddenColumns: ['O', 'P', 'T'],
        // R180:R182 hold the portal link together with a login and a password.
        hiddenCells: [hide('R', [180, 182])],
    },
    АРСЕНАЛ: { headerRows: [2], firstDataRow: 3 },
    'Подготовка ОГЭЕГЭ': { headerRows: [18, 19], firstDataRow: 20 },
    'факультет бизнеса': {
        headerRows: [2],
        firstDataRow: 3,
        // A92: name and e-mail of the person who grants access; I8: invitation to a Telegram chat.
        hiddenCells: [hide('A', [92, 92]), hide('I', [8, 8])],
    },
    'Тренинги ЮЛ': { headerRows: [4], firstDataRow: 5 },
    'Для детей': { headerRows: [5], firstDataRow: 6 },
    'Кросс-продажи по галочке': {
        headerRows: [2],
        firstDataRow: 3,
        hiddenCells: [hide('E', [13, 16])],
    },
    'Экспресс-курсы': { headerRows: [], firstDataRow: 1, hiddenCells: [hide('E', [10, 10])] },
    'Synergy Lingva House_NEW': {
        headerRows: [],
        firstDataRow: 1,
        hiddenCells: [hide('B', [5, 5])],
    },
    'Центр интеллекта': { headerRows: [1], firstDataRow: 2 },
    'Краткосрочные курсы': { headerRows: [1], firstDataRow: 2, hiddenColumns: ['G'] },
    'Synergy Lingva House_NEW (копия': {
        headerRows: [4],
        firstDataRow: 5,
        hiddenCells: [hide('A', [52, 54])],
    },
    'ВЕСЕННЯЯ РАСПРОДАЖА': {
        headerRows: [3, 4],
        firstDataRow: 5,
        hiddenColumns: ['Q', 'Y'],
        // Rows 107-117: demo logins and passwords; A2: e-mail of the knowledge-base owner.
        hiddenCells: [
            ...hideColumns(['B', 'C', 'D', 'E', 'F', 'G'], [107, 117]),
            hide('A', [2, 2]),
        ],
    },
    Get4click: {
        headerRows: [3, 4],
        firstDataRow: 5,
        hiddenColumns: ['P', 'X'],
        hiddenCells: [...hideColumns(['B', 'C', 'D', 'E', 'F'], [110, 120]), hide('A', [2, 2])],
    },
    'ДЛЯ МП ДРБ софинансирование': { headerRows: [4], firstDataRow: 5 },
    БИГЛИОН: { headerRows: [2], firstDataRow: 3 },
    'для сотрудников ЦЗН': { headerRows: [2], firstDataRow: 3 },
};

const MTI_DPO_LAYOUTS: Readonly<Record<string, SheetLayout>> = {
    'Общий реестр': { headerRows: [1, 2, 3], firstDataRow: 4 },
    'СТАРТ UP (ДПО, ПО+ВО)': { headerRows: [1, 2], firstDataRow: 4 },
    'ПРОГРАММА ПЛЮС': { headerRows: [1, 2], firstDataRow: 3 },
    'Программа СТАРТ (ДО+СПО)': { headerRows: [1, 2], firstDataRow: 3 },
    УСКОРИТЕЛИ: { headerRows: [1, 2], firstDataRow: 4 },
    'Общий реестр (копия)': { headerRows: [1, 2, 3], firstDataRow: 4 },
    'Общий реестр КОПИЯ от 2.06': { headerRows: [1, 2, 3], firstDataRow: 4 },
};

const THEATRE_LAYOUTS: Readonly<Record<string, SheetLayout>> = {
    // B23 is an invitation to the closed sales chat; the rest of column B holds product names.
    Главная: { headerRows: [7], firstDataRow: 8, hiddenCells: [hide('B', [23, 23])] },
    Колледж: { headerRows: [6, 7], firstDataRow: 8 },
    Специалитет: { headerRows: [3], firstDataRow: 4 },
    Магистратура: { headerRows: [3], firstDataRow: 4 },
    'Взрослые ДПО': { headerRows: [10], firstDataRow: 11 },
};

const BASTA_LAYOUTS: Readonly<Record<string, SheetLayout>> = {
    Главная: { headerRows: [6], firstDataRow: 7 },
    Матрица: { headerRows: [1], firstDataRow: 2 },
    'Вебинары для догрева': { headerRows: [1], firstDataRow: 4 },
    'РЕЕСТР ПРОГРАММ': { headerRows: [1], firstDataRow: 2 },
    'ID ПРОДУКТОВ': { headerRows: [1], firstDataRow: 2 },
    Колледж: { headerRows: [3], firstDataRow: 4 },
    Специалитет: { headerRows: [3], firstDataRow: 4 },
    'ДПО Музыкальный продакшн (Онлай': { headerRows: [3], firstDataRow: 4 },
    'ДПО Музыкальный менеджмент (Онл': { headerRows: [3], firstDataRow: 4 },
    'ДПО Сонграйтинг (Онлайн)': { headerRows: [3], firstDataRow: 4 },
    'ДПО Концертный продакшн (Онлайн': { headerRows: [3], firstDataRow: 4 },
    'ДПО Вокал индивидуальный': { headerRows: [3], firstDataRow: 4 },
    'Музыкальный Лагерь': { headerRows: [3], firstDataRow: 4 },
    'ДПО Вокал с Анной Маршанией': { headerRows: [3], firstDataRow: 4 },
};

const ACADEMY_LAYOUTS: Readonly<Record<string, SheetLayout>> = {
    'Все продукты': {
        headerRows: [3, 4],
        firstDataRow: 5,
        // P: demo access (logins, passwords), V: contacts of the people in charge.
        hiddenColumns: ['P', 'V'],
        // B187:E197: logins and passwords of the "client bonuses" table; X158: name and e-mail of a manager.
        hiddenCells: [...hideColumns(['B', 'C', 'D', 'E'], [187, 197]), hide('X', [158, 158])],
    },
};

const SHORT_COURSES_LAYOUTS: Readonly<Record<string, SheetLayout>> = {
    'Краткосрочные курсы (общий реес': { headerRows: [3], firstDataRow: 4 },
    'Краткосрочные курсы (разбивка п': { headerRows: [3], firstDataRow: 4 },
};

/** The book the tools use when the agent names none. */
export const DEFAULT_BOOK = 'ЦП';

/** Workbooks the agent can read. */
export const SHEETS_QA_BOOKS: readonly BookConfig[] = [
    book(
        'ЦП',
        'ЦП.xlsx',
        'Ценовая политика университета и колледжей: прайсы СПО, бакалавриата, магистратуры, аспирантуры, филиалов, MBA и методические базы',
        {
            layouts: SHEET_LAYOUTS,
            overrides: RELATION_OVERRIDES,
            linkRules: LINK_RELATIONS,
            gids: SHEET_GIDS,
        },
    ),
    book(
        'ДПО для РБ',
        'ДПО для РБ.xlsx',
        'Реестры программ ДПО для менеджеров продаж, «Арсенал», ОГЭ/ЕГЭ, факультет бизнеса, тренинги для юридических лиц',
        {
            layouts: DPO_RB_LAYOUTS,
            guideAliases: { 'Реестр ОБЩИЙ с классификацией (': 'Реестр ОБЩИЙ' },
        },
    ),
    book(
        'РЕЕСТР ДПО МТИ',
        'РЕЕСТР ДПО МТИ - 29.09.2026-2.xlsx',
        'Прайс ДПО МТИ, тарифы, связки с ВО и СПО',
        { layouts: MTI_DPO_LAYOUTS },
    ),
    book(
        'Театральный факультет',
        'Театральный фактультет.xlsx',
        'Продукты театрального факультета',
        { layouts: THEATRE_LAYOUTS },
    ),
    book(
        'Школа современной музыки БАСТА',
        'Школа современной музыки БАСТА.xlsx',
        'Продукты школы «БАСТА х СИНЕРГИЯ»',
        {
            layouts: BASTA_LAYOUTS,
            guideAliases: {
                'ДПО Музыкальный продакшн (Онлай': 'ДПО Музыкальный продакшн (Онлайн)',
                'ДПО Музыкальный менеджмент (Онл': 'ДПО Музыкальный менеджмент (Онлайн)',
                'ДПО Концертный продакшн (Онлайн': 'ДПО Концертный продакшн (Онлайн)',
            },
        },
    ),
    book(
        'База знаний Академия Синергия',
        'База знаний Академия Синергия.xlsx',
        'Сводный прайс и карточки продуктов Академии Синергия',
        { layouts: ACADEMY_LAYOUTS },
    ),
    book(
        'Реестр краткосрочных курсов',
        'Реестр краткосрочных курсов .xlsx',
        'Короткие курсы за 7 500 ₽',
        {
            layouts: SHORT_COURSES_LAYOUTS,
            guideAliases: {
                'Краткосрочные курсы (общий реес': 'Краткосрочные курсы (общий реестр)',
            },
        },
    ),
];

export interface Searcher {
    /** Subagent name the main agent sees in the `task` tool. */
    readonly agent: string;
    /** `education`: SPO, bachelor and above; `courses`: DPO and short courses. */
    readonly branch: 'education' | 'courses';
    /** Level, direction or product line as the managers say it. */
    readonly level: string;
    /** Book the searcher reads; the tools get it as the `book` argument. */
    readonly book: string;
    /** Sheets of the book to search. */
    readonly sheets: readonly string[];
    /** `default`: asked unless the client named another direction; `on-request`: only when the client asks for it. */
    readonly scope: 'default' | 'on-request';
    /** What the sheets cover, for the main agent to choose the searcher. */
    readonly covers: string;
    /** Sheets the searcher must not use as a source (hidden, outdated, copies) and why. */
    readonly ignoreSheets?: readonly string[];
    /** How a course row is laid out in the sheets of the book. */
    readonly rowFormat?: string;
    /** Traps of the book that change the answer. */
    readonly pitfalls?: readonly string[];
}

/** Book of the education searchers. */
const EDUCATION_BOOK = DEFAULT_BOOK;

function education(
    agent: string,
    level: string,
    sheet: string,
    scope: Searcher['scope'],
    covers: string,
): Searcher {
    return {
        agent,
        branch: 'education',
        level,
        book: EDUCATION_BOOK,
        sheets: [sheet],
        scope,
        covers,
    };
}

/** Directions searched by parallel subagents; add one here when its price sheet is described. */
export const EDUCATION_LEVELS: readonly Searcher[] = [
    education(
        'spo-searcher',
        'СПО (колледж)',
        'СПО',
        'default',
        'колледж Синергии на базе 9 и 11 классов',
    ),
    education(
        'bachelor-searcher',
        'бакалавриат и специалитет',
        'БАКСПЦ',
        'default',
        'бакалавриат и специалитет Синергии',
    ),
    education(
        'master-searcher',
        'магистратура',
        'МАГ',
        'on-request',
        'магистратура Синергии (клиент с высшим образованием или спрашивает магистратуру)',
    ),
    education(
        'postgraduate-searcher',
        'аспирантура и ординатура',
        'АСПОРД',
        'on-request',
        'аспирантура и ординатура',
    ),
    education(
        'mba-searcher',
        'MBA и программы для руководителей',
        'МВА',
        'on-request',
        'Executive MBA, MBA Foundation, Mini MBA, директорские программы',
    ),
    education(
        'mti-searcher',
        'МТИ (Московский технологический институт)',
        'МТИ',
        'on-request',
        'колледж, бакалавриат и магистратура МТИ',
    ),
    education(
        'map-searcher',
        'МАП (Московская академия предпринимательства)',
        'МАП',
        'on-request',
        'колледж, бакалавриат, магистратура и аспирантура МАП',
    ),
    education(
        'partners-searcher',
        'вузы-партнёры БГИ, СПИГ, ЮФУ',
        'ЮФУБГИСПИГ',
        'on-request',
        'колледж БГИ, СПИГ, ЮФУ (у большинства набор закрыт)',
    ),
    education(
        'branches-searcher',
        'региональные филиалы',
        'Филиалы',
        'on-request',
        'Омск, Карачаево-Черкесск, Якутск, Мурманск, Барнаул, Воронеж, Самара, Челябинск',
    ),
    education(
        'dubai-searcher',
        'Дубайский филиал',
        'Дубай',
        'on-request',
        'бакалавриат, магистратура, MBA и курсы в Дубае',
    ),
];

/** Searchers of courses and DPO: one per book; rows and traps come from the scan of the books. */
export const COURSE_SEARCHERS: readonly Searcher[] = [
    {
        agent: 'dpo-rb-searcher',
        branch: 'courses',
        level: 'каталоги ДПО для менеджеров продаж (ДПО для РБ)',
        book: 'ДПО для РБ',
        scope: 'default',
        covers: 'реестр ДРБ (~211 программ ПП/ПК/ДО/ПО), общий реестр ДПО по 38 темам, «Арсенал» (охрана труда, ПБ, ГО и ЧС, экология), подготовка к ОГЭ/ЕГЭ, Факультет Бизнеса и подписка, тренинги для юрлиц, детские программы, кросс-продажи, экспресс-курсы, Центр интеллекта, английский Lingva House',
        sheets: [
            'Реестр ДРБ',
            'Реестр ОБЩИЙ с классификацией (',
            'АРСЕНАЛ',
            'Подготовка ОГЭЕГЭ',
            'факультет бизнеса',
            'Тренинги ЮЛ',
            'Для детей',
            'Кросс-продажи по галочке',
            'Экспресс-курсы',
            'Центр интеллекта ',
            'Synergy Lingva House_NEW',
        ],
        ignoreSheets: [
            'Краткосрочные курсы (скрытый, листа нет в описаниях; ДО-курсы по 7 500 ₽ с контактным e-mail, использовать только по прямому запросу и с оговоркой)',
            'Synergy Lingva House_NEW (копия (скрытая копия листа Lingva)',
            'ВЕСЕННЯЯ РАСПРОДАЖА (скрытый, акция закончилась 31.05.2025, внутри логины/пароли демо)',
            'Get4click (скрытый, акционные цены, внутри логины/пароли демо)',
            'ДЛЯ МП ДРБ софинансирование (скрытый, только для сотрудников ДРБ, не описан)',
            'БИГЛИОН (скрытый, не описан)',
            'для сотрудников ЦЗН (скрытый, не описан)',
        ],
        rowFormat:
            'Реестр ДРБ: название A (разделы: строки с одним A; пометки в скобках «с проверкой ДЗ», «с поддержкой»), вид B (ПП/ПК/ДО/ПО), цена C (+ D с проверкой ДЗ, E с ДЗ и вебинарами), срок F, часы G, квалификация H, название в Битриксе I, материалы J, бриф L. Реестр ОБЩИЙ: название A, уровень B, часы C, срок D, цена E (может быть «полная / сниженная», в долларах, диапазон), форма I, даты старта J, документ K, держатель L, Битрикс F, презентация G, учебный план H, бриф S, описание Q; контакты M-P, T не раскрывать. АРСЕНАЛ: название A, вид D, часы G, срок H, форма I, документ J, цена K, УП M, Битрикс C. ОГЭЕГЭ: блоки с шапками в строках 18-19, 32-33, 56-57, 67-68; продукт A, категория B, направление C, пакет D, название E, цена F, ID товара G, срок H, занятия/часы I-J, презентация/паспорт справа. Факультет бизнеса: название B, цена C (текст «2 999»), ID D, лендинг E. Тренинги ЮЛ: название B, форма C, условия D, аудитория E, документ F, срок G, цена H («от 120 000»). Для детей: название B, уровень C, длительность E, пакеты F, формат G, цена H, документ P. Кросс-продажи: продукт A, цена B, держатель D. Центр интеллекта: наименование A, срок B, цена C, ID D, особенности E.',
        pitfalls: [
            'Скрытые строки: в Реестр ДРБ 40 штук (красные, вероятно сняты с продажи), в Реестр ОБЩИЙ 72 (в т.ч. целиком разделы Музыка, Юриспруденция, История, Налоги, 1С), в Кросс-продажи 4-9 и 28-45, в ОГЭЕГЭ 8-10 и 12, в Центр интеллекта 3-5: не предлагать как действующие без оговорки, что они могли быть сняты с продажи.',
            'Две и более цены: в Реестр ДРБ C/D/E (базовая, с проверкой ДЗ, с ДЗ и вебинарами; в E172-173 «100 000/ 70 000» без пояснения); в Реестр ОБЩИЙ E формат «189 000 / 75 600», варианты через запятую/слэш (строки 210, 224, 261, 262, 277, 292), пакеты текстом, диапазон, доллары (строки 8, 9, 226, 284, 347), в 324 разделитель «|»; в ОГЭЕГЭ цена зависит от пакета и числа предметов; у Арсенала одна цена без скидок.',
            'Один продукт повторяется строками с разными часами/сроком/ценой (252 ч/3 мес и 520 ч/4 мес; ПП и ПК; дубли названий): называй все варианты или уточняй, не выбирай произвольно.',
            'Расшифровок ПП/ПК/ДО/ПО, ДРБ, МП, ВО/СПО, КОРВИР в книге нет: не придумывай. Бесплатные программы КОРВИР в Реестр ДРБ (строки 237-244): документ не выдаётся.',
            'Скидки не выдумывай: правила в «Регламенте о скидках» (A1 Реестр ДРБ), на листах скидок нет. Даты актуальности цен нигде не указаны.',
            'Прошедшие даты (на 04.11.2026): ОГЭЕГЭ блок 1 (старт 15.06.2026) помечен «Продажи закрыты», пересдача отменена, можно предложить репетиторство; 9-месячные курсы стартовали 01.09.2026, дата окончания продаж не указана (проси уточнить актуальность набора); сопровождение «База» стартует 15.06.2027 (продажи до 03.07.2027), «Про» 01.04.2027 (до 10.07.2027). В Реестр ОБЩИЙ J есть даты 2024-2025 гг. и пометки «Ноябрь-декабрь 2024»: считай их устаревшими.',
            'Названия листов: «Реестр ОБЩИЙ с классификацией (» (обрезано, скобка не закрыта), «факультет бизнеса» (с маленькой буквы), «Центр интеллекта » с пробелом на конце.',
            'Секреты и контакты не раскрывай: логины/пароли в Реестр ОБЩИЙ R180-R182, контакты в O, P, T (эти ячейки для тебя скрыты); ФИО держателей M, N только по прямому вопросу и без контактов; Факультет бизнеса A92 (ответственный за доступы). Менеджера направляй к самой ячейке.',
            'Ячейки цен часто текст с пробелами/«₽»/«Р»: сравнивай как числа. Ошибки в данных: Реестр ОБЩИЙ D10 (срок чужой программы), L15; ссылки в Реестр ДРБ колонки J, L внешние (УП, бриф, материалы): только отдавай как ссылки.',
            'Тренинги ЮЛ: цена «от 120 000», единица цены (группа/день/человек) не указана; только очный формат, 2 дня, для юрлиц.',
        ],
    },
    {
        agent: 'mti-dpo-searcher',
        branch: 'courses',
        level: 'ДПО МТИ (Московский технологический институт)',
        book: 'РЕЕСТР ДПО МТИ',
        scope: 'default',
        covers: 'прайс ДПО МТИ: ПП (диплом), ПК (удостоверение), ДО (сертификат) по 6 сферам с тарифами БАЗОВЫЙ/ОПТИМА/ПРЕМИУМ и скидками (новый клиент 5%, выпускники МТИ 10%, студенты МТИ 35%, оплата ВО/СПО+ДПО 50%); связки СТАРТ UP с ВО; допродажи «Программа ПЛЮС»',
        sheets: ['Общий реестр', 'СТАРТ UP (ДПО, ПО+ВО)', 'ПРОГРАММА ПЛЮС'],
        ignoreSheets: [
            'Общий реестр (копия): скрытая урезанная старая копия (34 строки), цены/значения могут отличаться; только для вопросов о расхождениях',
            'Общий реестр КОПИЯ от 2.06: скрытая устаревшая копия (33 программы против 52); не для действующих цен, только для сравнения со старой версией или вопроса про «Нейросети для карьеры»',
            'Программа СТАРТ (ДО+СПО): скрытый справочник состава (дисциплины, часы, продукт в Битрикс), цен и сроков нет; использовать только по вопросу о составе СТАРТ, с оговоркой что лист скрытый',
            'УСКОРИТЕЛИ: скрытый справочник пакета «Максимум PRO 2в1 ВО+ДПО» (8 программ ДПО 3,5 мес), актуальность не подтверждена; использовать только по прямому вопросу об ускорении ВО до 3 лет, с оговоркой',
        ],
        rowFormat:
            'Лист «Общий реестр» (шапка строк 1-3, данные с 4, строки 4-55): A сфера, B программа, C документ (Диплом ПП / Удостоверение ПК / сертификат ДО), D подуровень ПП/ПК/ДО; тарифы: БАЗОВЫЙ E (база), F-I (скидки 5/10/35/50%), J часы заочная; ОПТИМА K (база), L-O скидки, P часы очно-заочная; ПРЕМИУМ Q (база), R-U скидки, V часы очная; W срок обучения, X квалификация, Y ссылка на сайт, Z презентация, AA УП, AB диплом (образец). Программа ПЛЮС в общем реестре: строки 53-55, скидки там текстом. Лист «СТАРТ UP»: три блока с разными шапками (1-2, 17-18, 41-42); колонки A-C ссылки (образец диплома, учебный план, презентация), далее программа ДПО/ДО/ПО, продукт в Битрикс, направления ВО (блок 2: A-I с дисциплинами и часами). «ПРОГРАММА ПЛЮС» (строки 3-5): D программа, F дисциплины, G документ, H стоимость, I часы, J срок, A-C образец/УП/презентация.',
        pitfalls: [
            'В «Общем реестре» у каждой программы три тарифа и пять цен (база + 4 скидки) на тариф: всегда называй тариф и категорию скидки; часы зависят от формы обучения (заочная/очно-заочная/очная).',
            'Названия «Безопасность строительства» (строки 4 и 17) и «Эксплуатация зданий и сооружений» (11 и 18) повторяются как ПП и как ПК с разными ценами/часами/сроками: различай по колонке C/D.',
            'Строка 13 «Охрана труда» (ПП) скрыта: не предлагай без оговорки (нет образца диплома и квалификации, неизвестно снята ли с продажи).',
            'В «СТАРТ UP» строки 41-45 (блок «курс ДПО + МАГ») скрыты: не предлагай клиентам без подтверждения.',
            'Скрытые листы (копии, СТАРТ ДО+СПО, УСКОРИТЕЛИ): если данные взяты оттуда, прямо сообщи, что лист скрытый и актуальность не подтверждена; для цен используй только «Общий реестр».',
            'Срок в «Общем реестре» местами в неделях (строка 23: 13 недель, 25: 14 недель), у «Риск-менеджмент в банковской деятельности» (23) нет квалификации; у части ПК только БАЗОВЫЙ тариф без скидок (квалификация «-»).',
            'Дат актуальности цен и старта на листах нет (только 29.09.2026 в названии файла): не утверждай актуальность на дату и не называй даты старта.',
            'В «ПРОГРАММА ПЛЮС» стоимость записана текстом (например «р.20 000»); в «Общем реестре» ПЛЮС (строки 53-55) скидки тоже текстом.',
            'В «СТАРТ UP» итоги часов не всегда равны сумме дисциплин (расхождение 2-4 часа).',
            'Ссылки в ячейках могут быть заглушкой «#» или пустыми (например нет ссылки на образец диплома в AB13): не выдумывай ссылку.',
        ],
    },
    {
        agent: 'theatre-searcher',
        branch: 'courses',
        level: 'театральный факультет',
        book: 'Театральный факультет',
        scope: 'on-request',
        covers: 'театральный колледж, специалитет, магистратура (очно, 980 000 руб./год каждый), ДПО для взрослых (Абонемент в актеры 130 000, Экспресс 50 000, VIP 500 000 без набора, Ораторское ДИСТ 25 000 не набирается); детские курсы и лагерь только в сводке на «Главной»',
        sheets: ['Главная', 'Колледж', 'Специалитет', 'Магистратура', 'Взрослые ДПО'],
        ignoreSheets: [
            'Мероприятия (без описания)',
            'Детские продукты (без описания, читать только если спрашивают про детские курсы)',
            'Площадка (без описания)',
            'Партнёры (без описания)',
            'Конкуренты (без описания)',
            'Отзывы (без описания)',
        ],
        rowFormat:
            'Это не прайс-реестр: у каждого листа свой формат. Главная: шапка строки 7; академические B-D (программа, срок, руб./год), неакадемические E-G (программа, срок, руб.), строки 8-13. Колледж/Специалитет/Магистратура: карточка продукта в строке 4 (ID, цена за год, срок и академ. часы, ответственный), далее мастера, прослушивание, площадка (у колледжа F-I строка 8), дисциплины, вопросы/преимущества; вид всегда очная академическая программа, ПП/ПК/ДО не указан. Взрослые ДПО: шапка строки 10, строки 11-14: A название, B ID, C цена, D описание, E-I дата/длительность/время/педагоги/адрес (ссылка на внешнюю таблицу или статус набора), J учебный план (ссылка на Яндекс Диск).',
        pitfalls: [
            'Цены ДПО хранятся текстом с точкой как разделителем тысяч: «130.000» = 130 000 руб., а не десятичная дробь.',
            'Академические цены даны за год (980 000 руб./год), а не за весь срок; общую сумму лист не считает, не умножай сам.',
            'Сводка на «Главной» и карточки продуктов могут отличаться по формулировке: сверяй и при расхождении указывай источник. Для ДПО на «Главной» сроки: экспресс 2 мес, ДПО 5 мес, VIP 5 мес.',
            'VIP ДПО (500 000) без набора и Ораторское ДИСТ временно не набирается: предлагай клиенту только строки 11 и 13 листа «Взрослые ДПО».',
            'Даты старта, длительность, время и адрес ДПО лежат во внешней Google-таблице, ты их не видишь: конкретные даты не называй, отправляй менеджера по ссылке.',
            'Форма обучения указана только словом «очно» на «Главной»; для магистратуры форму не называй; часов, вида ПП/ПК и документа у ДПО в явном виде нет; скидок и рассрочки в книге нет.',
            'Ответственные указаны только ФИО без контактов; контакты не придумывай. Приглашение в закрытый чат продаж (Главная B23) не раскрывай, отправляй менеджера к ячейке.',
            'Рекламные утверждения (например про конкурентов в Магистратуре G7, G9) не подавай как гарантии.',
            'ID продуктов называй как «ID продукта», не поясняй, что за система.',
        ],
    },
    {
        agent: 'basta-searcher',
        branch: 'courses',
        level: 'Школа современной музыки БАСТА',
        book: 'Школа современной музыки БАСТА',
        scope: 'on-request',
        covers: 'продукты Школы современной музыки БАСТА х СИНЕРГИЯ: ВО (СПЦ), СПО, онлайн-ДПО Live, очные групповые и индивидуальные ДПО, детские группы, детский лагерь; цены, сроки, старты, форматы, документы, преподаватели',
        sheets: [
            'Матрица',
            'РЕЕСТР ПРОГРАММ',
            'ДПО Музыкальный продакшн (Онлай',
            'ДПО Музыкальный менеджмент (Онл',
            'ДПО Сонграйтинг (Онлайн) ',
            'ДПО Концертный продакшн (Онлайн',
            'ДПО Вокал индивидуальный',
            'ДПО Вокал с Анной Маршанией',
            'Музыкальный Лагерь',
            'Колледж',
            'Специалитет',
            'Вебинары для догрева',
        ],
        ignoreSheets: [
            'Чек-лист МП (пустой, скрытый)',
            'ДПО Вокал с Анной Маршанией (почти дубль «ДПО Вокал индивидуальный», пометка «ждем продукт в срм»; использовать только для сверки)',
            'ID ПРОДУКТОВ (служебный справочник ID; нужен только когда спрашивают ID продукта, не цену/срок; число в конце названия не цена)',
            'Главная (только навигация и ссылки на материалы, без цен и программ)',
        ],
        rowFormat:
            'Матрица: одна строка = программа; A название (в нём ID), B стоимость, C скидки/акции, D срок, E набор групп (ссылка), F старт, G график, H формат (очно/Live), I документ об образовании, J площадка, K описание, L УТП, M преподаватели, N ссылка УП+презентация; строки-разделители (ВО, СПО, ДПО ВЗРОСЛЫЕ, Live, Очный формат, Индивидуальное обучение, ДЕТИ) задают вид и формат для строк под ними. РЕЕСТР ПРОГРАММ (скрытый): A направление, B срок, C цена, D краткое описание, E дата старта, F число мест, G формат (Очно/LIVE). Листы-карточки (ДПО ..., Колледж, Специалитет, Лагерь): строка 4 = ID / цена / срок (часы трансляций и самоподготовки) / расписание, строка 7 = подписи (УП/презентация, площадка, УТП, дисциплины, преподаватели), строка 8 = значения, ниже FAQ про документы. Вид ПП/ПК/ДО колонкой не вынесен: ВО=СПЦ, СПО, остальное ДПО; тип ДО/ДОП или ДПО/ППК есть только в ID ПРОДУКТОВ.',
        pitfalls: [
            'Цены расходятся между листами: Матрица, РЕЕСТР ПРОГРАММ и карточки дают разные значения (например Концертный продакшн: 75 000 в Матрице, 100 000 в карточке, 200 000 в реестре; Музыкальный продакшн онлайн 75 000 в Матрице против 250 000 в карточке). Не называй цену без оговорки о расхождении, показывай источник; в Матрице у части программ есть скидка (10% при согласовании, до 20%, до 10%).',
            'Матрица: строка 17 (Битмейкинг) скрыта; лист «Вебинары для догрева»: строки 12-23 скрыты; все листы кроме Главной, Матрицы и Вебинаров скрыты целиком, но данные читаемы.',
            'Даты старта часто прошли (на 04.11.2026): 15.05.2026 в карточке Музыкального продакшна, 03.08.2026 в Концертном продакшне, лагерь 6-12 июля без года, реестр 01.09.2026; в Матрице есть даты без года и 01.09.2027 для ВО. Не называй прошедшую дату как ближайший старт, отсылай к «Набор групп».',
            'Цены бывают диапазоном по срокам (например 100к - 1 мес, 210к - 3 мес) и «за год» (1 000 000 руб. за год при сроке 4-5 лет); не умножай и не округляй без указания.',
            'В названиях встречаются возрастные пометки (6+, 12+, 14+, 4-14 лет) и «со звездой» (индивидуально, у преподавателя-артиста): это разные продукты с разной ценой.',
            'Один и тот же ID продукта может иметь две записи в ID ПРОДУКТОВ (ДО/ДОП и ДПО/ППК); различие в книге не объяснено.',
            'Ссылки на Яндекс.Диск и Google-таблицы ведут во внешние материалы, их содержимое недоступно.',
        ],
    },
    {
        agent: 'academy-searcher',
        branch: 'courses',
        level: 'Академия Синергия (онлайн-курсы)',
        book: 'База знаний Академия Синергия',
        scope: 'default',
        covers: 'сводный прайс и карточки 168 продуктов Академии Синергия в 10 блоках (Программирование, Дизайн, Маркетинг, Менеджмент, Игры, ДРБ, Рабочие профессии, Строительство МТИ, Курсы для детей, Нейросети): цена, рассрочка, срок, часы, тарифы, трудоустройство, документ, подарочные курсы',
        sheets: ['Все продукты'],
        rowFormat:
            'Строка = продукт, шапка в строках 3-4 (данные с 5). Название: A (для тарифных линеек в скобках Базовый/Оптимальный/Расширенный тариф). Вид: B (ПП/ПК/ПО; для клиентов с СПО/ВО), C (вариант ДО для клиентов без СПО/ВО; «—»/пусто = такому клиенту не продаётся). Цены: D (на сайте, для позиционирования), E (в рассрочку, обычно 40% от D, скидка -60%), G (единовременная оплата, обычно 90% от E; колонка скрыта, но читать можно), F (макс. срок рассрочки). Срок H, часы I. Трудоустройство J, стажировки K, тьютор L. Документ: AB (образец, Свидетельство/Удостоверение, Диплом, Сертификат). Учебный план и презентация: M, затем X; страница курса: S; УТП: T; подарочные курсы: AC; ДЗ Y, диплом. проект Z; тех. требования AD. Заголовки блоков стоят отдельной строкой в A (строки 5, 29, 51, 97, 115, 131, 139, 157, 172, 179), «Бонусы для клиентов» с 186 не курсы. Колонки P (демо-доступ) и V (контакты ответственных) скрыты от тебя.',
        pitfalls: [
            'Две цены: D (на сайте, для позиционирования) и E (по распродаже в рассрочку, -60%); G (единовременная) на 10% ниже E. Называй, какая именно цена; пропущенное считай по правилам E=40% D, G=90% E и говори, что это расчёт. Формат цен нерегулярный: «228 900 ₽», «194750», «137500 ₽».',
            'Исключения по ценам: у Кинолога (155, 156) и Повара-кондитера (154) в G вместо цены текст срока; у Сварщика/Электрика/МТИ/Повара G не равна 90% E; у ИИ-агентов (182) G пусто; у части строк (28, 98, 116, 158) только D.',
            'Скрытые строки (47): 6, 10, 12, 14-16, 18, 19, 21, 22, 26-28, 30, 35, 47, 49, 55, 59, 63, 67, 84-86, 98, 100, 115-130 (весь блок «Игры»), 133, 140, 147, 158, 160: устаревшие/дубли; если есть видимая замена (тарифы «+ ИИ»), отвечай по видимой, про скрытые говори «может быть снят с продажи».',
            'Для линейки с тарифами уточни у менеджера, какой тариф интересует (Базовый/Оптимальный/Расширенный; чем выше, тем больше часов, срок, встреч, подарков); скрытая строка без тарифа (Python-разработчик 6, Графический дизайнер 30, Дизайнер интерьеров 35) — старая версия.',
            'Даты старта в H у рабочих профессий («Старт 30 октября», 9, 10, 17 ноября) привязаны к 2026 году; на 04.11.2026 «30 октября» уже прошло: не предлагай как будущую, проси уточнить график. Даты окончания распродажи в листе нет. Общее правило: старт в течение 10 дней после оплаты (B1).',
            'Одинаковые названия у разных программ: «Нейросети для каждого» (25 и 180), «Безопасность строительства» (159 за 100 000 ₽ и 171 за 15 000 ₽), «Эксплуатация зданий и сооружений» (166 и 170), «Водоснабжение и водоотведение» (160 скрытая, 168), «C# с нуля до PRO», «С++ с нуля до PRO»: различай по цене, часам и колонке B (ПП/ПК).',
            'B содержит название в CRM, склеенное с типом и служебным числом («Python-разработчикПП, АС, 265»); число после «АС» — служебный код, клиенту не называй. Расшифровка ДО/ПП/ПК в листе не подтверждена, только ПО = профессиональное обучение.',
            'Колонка C: «—»/«-»/пусто означает, что программа не продаётся клиенту без СПО/ВО (ДРБ только ВО, нейросети, дети, строительство, рабочие профессии).',
            'Блок ДРБ (131-138): единая цена 137 500 ₽, только для клиентов с ВО. Рабочие профессии: срок вида «2/4 мес» (два варианта по тарифу), в I часы вида «256 в т.ч. 16 часов практики». Часы в тематических листах могут расходиться: доверяй этому листу.',
            'Секреты: логины/пароли в P и в таблице бонусов (B187:E197), контакты в V и X158 скрыты. Давай только факт, что демо-доступ есть. На вопрос «кто ответственный» отвечай «см. чат продукта (U)» либо отказом.',
        ],
    },
    {
        agent: 'short-courses-searcher',
        branch: 'courses',
        level: 'краткосрочные дистанционные курсы',
        book: 'Реестр краткосрочных курсов',
        scope: 'default',
        covers: 'каталог из 183 коротких дистанционных курсов (ДО) за 7 500 руб., 72 ч., сертификат: описание, ценностное преимущество, ссылка на УП, статус готовности; второй лист подбирает курс-альтернативу по специальности колледжа',
        sheets: ['Краткосрочные курсы (общий реес', 'Краткосрочные курсы (разбивка п'],
        rowFormat:
            'Лист 1 «Краткосрочные курсы (общий реес» (данные со строки 4, колонка A пустая): название C «Наименование программы»; вид ДО, часы и срок 72 ч. (1 мес.), цена 7 500 руб., документ сертификат: общие условия для всех курсов из шапки (B1, B2), в самих строках их нет; цель и темы D «Краткое описание курса»; чем полезен клиенту E «Ценностное преимущество»; учебный план F «УП» (ссылка «Скачать УП», у 173 из 183 строк); готовность G «Статус» (Готово / В работе). Лист 2 «Краткосрочные курсы (разбивка п» (данные со строки 4, 27 колонок): B «Обратно» (ссылка), C «Специальность колледжа», D «Квалификация», E «Приоритет» (1, 2, 3...), F «Альтернативный курс» (название из реестра листа 1), G «Скрипт презентации альтернативы», H краткое описание, I ценностное преимущество, J УП. Остальные колонки листа 2 смотри по факту.',
        pitfalls: [
            'Цена, срок и документ одни для всех курсов (7 500 руб., 72 ч., 1 мес., сертификат, не диплом и не удостоверение), берутся из шапки, а не из строк; даты актуальности цены на листе нет.',
            'Курсы со статусом «В работе» (22 шт.) предлагать клиенту нельзя без уточнения: описание не готово, часто нет УП; 17 строк — пустые заготовки «Цель: / Содержание:» без текста (например, строка 5 дублирует строку 4).',
            'Названия курсов повторяются и бывают с опечатками (например, «ребенка/ребёнка»), сортировка по алфавиту с мелкими нарушениями: ищи по нескольким вариантам написания.',
            'В реестре нет разделов и сфер; тематическую группу определяй по названию, это оценка, а не колонка.',
            'По специальности колледжа ищи альтернативу на листе 2 (разбивка, 873 строки); описание и УП конкретного курса — на листе 1. Названия из листа 2 «Альтернативный курс» ссылаются на названия листа 1.',
            'Курсы по сути являются названиями вузовских дисциплин, оформленными как отдельные курсы; это вывод по названиям, прямого подтверждения в книге нет.',
        ],
    },
];

/** Every searcher the main agent can start. */
export const SEARCHERS: readonly Searcher[] = [...EDUCATION_LEVELS, ...COURSE_SEARCHERS];
