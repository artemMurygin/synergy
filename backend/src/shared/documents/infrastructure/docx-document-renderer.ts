import { Injectable } from '@nestjs/common';
import {
    Document,
    HeadingLevel,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
    type IRunOptions,
} from 'docx';
import type { DocumentBlock, DocumentModel, TableBlock } from '../document-model';
import { DOCX_MEDIA_TYPE, DocumentRendererPort } from '../document-renderer.port';

const EMPTY_CELL = '—';
const FONT = 'Calibri';

/** `DocumentModel` → `.docx` на библиотеке `docx`. */
@Injectable()
export class DocxDocumentRenderer extends DocumentRendererPort {
    readonly mediaType = DOCX_MEDIA_TYPE;
    readonly extension = '.docx';

    async render(doc: DocumentModel): Promise<Buffer> {
        const document = new Document({
            title: doc.title,
            styles: { default: { document: { run: { font: FONT } } } },
            sections: [
                {
                    children: [
                        new Paragraph({ text: doc.title, heading: HeadingLevel.TITLE }),
                        ...doc.blocks.map(toChild),
                    ],
                },
            ],
        });
        return Packer.toBuffer(document);
    }
}

function toChild(block: DocumentBlock): Paragraph | Table {
    switch (block.kind) {
        case 'heading':
            return new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_2 });
        case 'paragraph':
            return 'runs' in block
                ? new Paragraph({
                      children: block.runs.map((r) => textRun(r.text, r.bold === true)),
                  })
                : new Paragraph({ text: block.text });
        case 'table':
            return toTable(block);
    }
}

function toTable(block: TableBlock): Table {
    const row = (cells: readonly (string | null)[], header: boolean): TableRow =>
        new TableRow({
            tableHeader: header,
            children: cells.map(
                (value) =>
                    new TableCell({
                        children: [
                            new Paragraph({
                                children: [textRun(cellText(value), header)],
                            }),
                        ],
                    }),
            ),
        });
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [row(block.header, true), ...block.rows.map((cells) => row(cells, false))],
    });
}

function textRun(text: string, strong: boolean): TextRun {
    const options: IRunOptions = strong ? { text, bold: true } : { text };
    return new TextRun(options);
}

function cellText(value: string | null): string {
    return value === null || value.trim().length === 0 ? EMPTY_CELL : value;
}
