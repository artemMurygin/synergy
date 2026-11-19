import type { AttachmentRef } from '../../../shared/agent-capability';

export const MAX_QUESTION_LENGTH = 2000;

export const MAX_RUN_ATTACHMENTS = 5;

export class InvalidRunInputError extends Error {}

export interface RunInputProps {
    readonly threadId: string;
    readonly runId: string;
    readonly question: string;
    readonly attachments?: readonly AttachmentRef[];
    /** Id of the history question this run replaces; absent for an ordinary run. */
    readonly replaceFromMessageId?: string;
}

/** What can be checked before the attached files are resolved. */
export interface RunInputDraft {
    readonly threadId: string;
    readonly question: string;
    readonly fileCount: number;
}

const KIB = 1024;
const MIB = KIB * 1024;
const GIB = MIB * 1024;

function formatSize(bytes: number): string {
    if (bytes < KIB) return `${String(bytes)} Б`;
    if (bytes < MIB) return `${String(Math.round(bytes / KIB))} КБ`;
    if (bytes < GIB) return `${String(Math.round(bytes / MIB))} МБ`;
    return `${(bytes / GIB).toFixed(1)} ГБ`;
}

/** The service block the agent sees after the question: facts about the files, never their content. */
export function formatAttachmentsBlock(attachments: readonly AttachmentRef[]): string {
    const lines = attachments.map(
        (file, index) =>
            `${String(index + 1)}. id=${file.fileId}; ${file.name}; ${file.kind}; ${formatSize(file.sizeBytes)}`,
    );
    return ['[Вложения]', ...lines].join('\n');
}

/** A new message of the user for a run: text, attached files, or both. */
export class RunInput {
    private constructor(
        readonly threadId: string,
        readonly runId: string,
        readonly question: string,
        readonly attachments: readonly AttachmentRef[],
        readonly replaceFromMessageId?: string,
    ) {}

    /** Text or at least one file, no more than MAX_RUN_ATTACHMENTS files, text within the limit. */
    static assertDraft(draft: RunInputDraft): void {
        const question = draft.question.trim();
        if (draft.threadId.trim().length === 0) {
            throw new InvalidRunInputError('Thread id must not be empty');
        }
        if (question.length === 0 && draft.fileCount === 0) {
            throw new InvalidRunInputError('Question must not be empty');
        }
        if (question.length > MAX_QUESTION_LENGTH) {
            throw new InvalidRunInputError(
                `Question is longer than ${String(MAX_QUESTION_LENGTH)} characters`,
            );
        }
        if (draft.fileCount > MAX_RUN_ATTACHMENTS) {
            throw new InvalidRunInputError(
                `No more than ${String(MAX_RUN_ATTACHMENTS)} files can be attached to a message`,
            );
        }
    }

    static of(props: RunInputProps): RunInput {
        const attachments = [...(props.attachments ?? [])];
        RunInput.assertDraft({
            threadId: props.threadId,
            question: props.question,
            fileCount: attachments.length,
        });
        if (new Set(attachments.map((file) => file.fileId)).size !== attachments.length) {
            throw new InvalidRunInputError('The same file is attached twice');
        }
        return new RunInput(
            props.threadId,
            props.runId,
            props.question.trim(),
            Object.freeze(attachments),
            props.replaceFromMessageId,
        );
    }

    /** The text of the HumanMessage: the question and, when files are attached, the [Вложения] block. */
    agentText(): string {
        if (this.attachments.length === 0) return this.question;
        const block = formatAttachmentsBlock(this.attachments);
        return this.question === '' ? block : `${this.question}\n\n${block}`;
    }
}
