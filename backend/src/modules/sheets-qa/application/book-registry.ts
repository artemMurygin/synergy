import { BookLibraryPort, type Book, type BookInfo } from '../domain/ports/book-library.port';
import { WorkbookError } from '../domain/ports/workbook-reader.port';

export interface BookEntry extends BookInfo, Book {}

/** Keeps the books by id. Readers load their file on the first request, so registering a book is cheap. */
export class BookRegistry extends BookLibraryPort {
    private readonly entries = new Map<string, BookEntry>();

    constructor(
        entries: readonly BookEntry[],
        readonly defaultBook: string,
    ) {
        super();
        for (const entry of entries) this.entries.set(entry.id, entry);
        if (!this.entries.has(defaultBook)) {
            throw new Error(`The default book "${defaultBook}" is not registered`);
        }
    }

    list(): BookInfo[] {
        return [...this.entries.values()].map(({ id, description }) => ({ id, description }));
    }

    get(id?: string): Book {
        const entry = this.entries.get(id ?? this.defaultBook);
        if (entry === undefined) {
            throw new WorkbookError(
                `Unknown book "${id ?? ''}". Available books: ${[...this.entries.keys()].join(', ')}`,
            );
        }
        return entry;
    }
}
