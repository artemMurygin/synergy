import { ArgumentInvalidError } from '../errors';

export const DocumentErrorCode = {
    InvalidModel: 'DOCUMENT_INVALID_MODEL',
} as const;

export class InvalidDocumentModelError extends ArgumentInvalidError {
    override readonly code: string = DocumentErrorCode.InvalidModel;
}

export interface TextRun {
    readonly text: string;
    readonly bold?: boolean;
}

export interface HeadingBlock {
    readonly kind: 'heading';
    readonly text: string;
}

/** Абзац: простой текст или последовательность фрагментов (например, жирное имя спикера). */
export type ParagraphBlock =
    | { readonly kind: 'paragraph'; readonly text: string }
    | { readonly kind: 'paragraph'; readonly runs: readonly TextRun[] };

/** `null` или пустая строка в ячейке — значения нет, генератор рисует прочерк. */
export interface TableBlock {
    readonly kind: 'table';
    readonly header: readonly string[];
    readonly rows: readonly (readonly (string | null)[])[];
}

export type DocumentBlock = HeadingBlock | ParagraphBlock | TableBlock;

/**
 * Нейтральная модель документа: заголовок и блоки. Не знает ни о встречах, ни о задачах,
 * ни о формате файла; превращает её в файл `DocumentRendererPort`.
 */
export interface DocumentModel {
    readonly title: string;
    readonly blocks: readonly DocumentBlock[];
}

export const DocumentModel = {
    of(input: DocumentModel): DocumentModel {
        const title = input.title.trim();
        if (title.length === 0) {
            throw new InvalidDocumentModelError('Document title must not be empty');
        }
        return Object.freeze({
            title,
            blocks: Object.freeze(input.blocks.map(freezeBlock)),
        });
    },
};

function freezeBlock(block: DocumentBlock): DocumentBlock {
    if (block.kind !== 'table') {
        if ('runs' in block) {
            return Object.freeze({
                kind: block.kind,
                runs: Object.freeze(block.runs.map((r) => Object.freeze({ ...r }))),
            });
        }
        return Object.freeze({ ...block });
    }
    const width = block.header.length;
    if (width === 0) {
        throw new InvalidDocumentModelError('Table must have at least one column');
    }
    if (block.rows.some((row) => row.length !== width)) {
        throw new InvalidDocumentModelError(
            'Every table row must have as many cells as the header',
        );
    }
    return Object.freeze({
        kind: block.kind,
        header: Object.freeze([...block.header]),
        rows: Object.freeze(block.rows.map((row) => Object.freeze([...row]))),
    });
}
