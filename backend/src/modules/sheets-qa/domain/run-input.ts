export const MAX_QUESTION_LENGTH = 2000;

export class InvalidRunInputError extends Error {}

export interface RunInputProps {
    readonly threadId: string;
    readonly runId: string;
    readonly question: string;
}

/** Normalized input of an agent run: trimmed, non-empty question within the length limit. */
export class RunInput {
    private constructor(
        readonly threadId: string,
        readonly runId: string,
        readonly question: string,
    ) {}

    static of(props: RunInputProps): RunInput {
        const question = props.question.trim();
        if (props.threadId.trim().length === 0) {
            throw new InvalidRunInputError('Thread id must not be empty');
        }
        if (question.length === 0) throw new InvalidRunInputError('Question must not be empty');
        if (question.length > MAX_QUESTION_LENGTH) {
            throw new InvalidRunInputError(
                `Question is longer than ${String(MAX_QUESTION_LENGTH)} characters`,
            );
        }
        return new RunInput(props.threadId, props.runId, question);
    }
}
