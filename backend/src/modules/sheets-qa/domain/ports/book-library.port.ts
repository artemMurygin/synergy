import type { SheetGuidesPort } from './sheet-guides.port';
import type { WorkbookReaderPort } from './workbook-reader.port';

export interface BookInfo {
    readonly id: string;
    /** One line for the agent: what the book holds. */
    readonly description: string;
}

export interface Book {
    readonly reader: WorkbookReaderPort;
    readonly guides: SheetGuidesPort;
}

/** The workbooks the agent can read, by book id. */
export abstract class BookLibraryPort {
    /** Id of the book used when the agent names none. */
    abstract readonly defaultBook: string;
    abstract list(): BookInfo[];
    /** Without an id the default book; throws WorkbookError with the available ids if unknown. */
    abstract get(id?: string): Book;
}
