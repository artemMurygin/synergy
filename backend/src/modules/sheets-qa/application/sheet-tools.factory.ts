import { tool } from 'langchain';
import { z } from 'zod';
import type { BookLibraryPort } from '../domain/ports/book-library.port';
import { WorkbookError } from '../domain/ports/workbook-reader.port';

export interface SheetToolsOptions {
    /** Hard cap of one tool answer; larger answers ask the model to narrow the request. */
    readonly maxAnswerChars: number;
}

function createResponder(maxAnswerChars: number): (run: () => Promise<unknown>) => Promise<string> {
    return async (run: () => Promise<unknown>): Promise<string> => {
        try {
            const text = JSON.stringify(await run());
            if (text.length > maxAnswerChars) {
                return JSON.stringify({
                    error: 'The answer is too large. Narrow the request: fewer rows or specific columns.',
                });
            }
            return text;
        } catch (error) {
            if (error instanceof WorkbookError) return JSON.stringify({ error: error.message });
            throw error;
        }
    };
}

const bookSchema = z
    .string()
    .optional()
    .describe('Book id from list_books; omitted: the default book');

/** Read-only tools over the books and the guides of their sheets. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- tool() generics are inferred per tool
export function createSheetTools(library: BookLibraryPort, options: SheetToolsOptions) {
    const respond = createResponder(options.maxAnswerChars);

    const listBooks = tool(() => respond(() => Promise.resolve(library.list())), {
        name: 'list_books',
        description: `List the available books (workbooks) with the id and a short description of each. Every other tool takes an optional "book" argument; without it the book "${library.defaultBook}" is used.`,
        schema: z.object({}),
    });

    const readSheetGuide = tool(
        ({ book, sheet }) =>
            respond(() => {
                const { guides } = library.get(book);
                return sheet === undefined ? guides.index() : guides.guide(sheet);
            }),
        {
            name: 'read_sheet_guide',
            description:
                'Descriptions of the sheets of a book. Without a sheet: the structure of the book (a short description of every sheet and links to the guides). With a sheet name: the detailed guide of that sheet (columns, how to read prices, forms of study, relations to other sheets). Read the guide of a sheet before working with it, and only the guides you need.',
            schema: z.object({
                book: bookSchema,
                sheet: z
                    .string()
                    .optional()
                    .describe('Sheet name, e.g. "СПО"; omit for the table of contents of the book'),
            }),
        },
    );

    const listSheets = tool(({ book }) => respond(() => library.get(book).reader.listSheets()), {
        name: 'list_sheets',
        description:
            'List the sheets of a book with row/column counts. "described" sheets have labelled columns and have a guide (see read_sheet_guide).',
        schema: z.object({ book: bookSchema }),
    });

    const searchCells = tool(
        ({ book, queries, sheet }) =>
            respond(() => library.get(book).reader.searchCells(queries, sheet)),
        {
            name: 'search_cells',
            description:
                'Find cells in one sheet or in all sheets of the chosen book (never in other books). Takes SEVERAL queries in one call: a cell is returned when it matches ANY query, and a query matches when the cell contains ALL its words (case-insensitive substring, so a word stem finds all its forms). Returns sheet, row, column, text and "queries": the indexes of the queries the cell matched. Put every reformulation of the request into one call instead of calling the tool again and again. Then read_rows on the found rows.',
            schema: z.object({
                book: bookSchema,
                queries: z
                    .array(z.string().min(1))
                    .min(1)
                    .max(12)
                    .describe(
                        'Reformulations of the same request, e.g. ["дизайн", "дизайнер", "художник", "54.03.01"]',
                    ),
                sheet: z.string().optional().describe('Limit the search to one sheet'),
            }),
        },
    );

    const readRows = tool(
        ({ book, sheet, from_row, to_row, columns }) =>
            respond(() => library.get(book).reader.readRows(sheet, from_row, to_row, columns)),
        {
            name: 'read_rows',
            description:
                'Read rows of a sheet. Returns the header label of each returned column once (columnLabels) and, per row, its section (e.g. faculty) and non-empty cells {column, value, link?}. At most 15 rows per call; use "columns" to read only some columns.',
            schema: z.object({
                book: bookSchema,
                sheet: z.string(),
                from_row: z.number().int().min(1),
                to_row: z.number().int().min(1),
                columns: z
                    .array(z.string())
                    .optional()
                    .describe('Column letters, e.g. ["C","D","H"]'),
            }),
        },
    );

    const getRowLinks = tool(
        ({ book, sheet, row }) => respond(() => library.get(book).reader.getRowLinks(sheet, row)),
        {
            name: 'get_row_links',
            description:
                'Hyperlinks (external URLs) of a row, for example the entrance registration or a Drive folder. Links between sheets of the workbook are not returned here; use find_related for them.',
            schema: z.object({ book: bookSchema, sheet: z.string(), row: z.number().int().min(1) }),
        },
    );

    const findRelated = tool(
        ({ book, sheet, row }) => respond(() => library.get(book).reader.findRelated(sheet, row)),
        {
            name: 'find_related',
            description:
                'Rows of other sheets of the same book that describe the same program, taken from the hyperlinks of the price row: for a row of a price sheet ("СПО", "БАКСПЦ", "МАГ", "АСПОРД", "МТИ", "МАП", "ЮФУБГИСПИГ") the methodical base row ("МБ СПО", "МБ БАК", "МБ МАГ", "МБ АСП", "МБ МТИ", "МБ МАП", "МБ ЮФУБГИСПИГ"), the qualification project row ("МБ квалификация") and, for "БАКСПЦ", the profession row; for a methodical base row the price row(s). Other price sheets ("МВА", "Филиалы", "Дубай") have no such links. A relation with the note "matched by names, no hyperlink; verify" is only a guess, and a relation with the note "link target has a different name; verify" is a hyperlink whose target looks like another program: warn the user in both cases.',
            schema: z.object({ book: bookSchema, sheet: z.string(), row: z.number().int().min(1) }),
        },
    );

    return [listBooks, readSheetGuide, listSheets, searchCells, readRows, getRowLinks, findRelated];
}
