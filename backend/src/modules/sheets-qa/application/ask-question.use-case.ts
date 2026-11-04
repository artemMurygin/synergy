import { Injectable } from '@nestjs/common';
import { SheetsAssistantPort, type AssistantAnswer } from '../domain/ports/sheets-assistant.port';

export const MAX_QUESTION_LENGTH = 2000;

export class InvalidQuestionError extends Error {}

@Injectable()
export class AskQuestionUseCase {
    constructor(private readonly assistant: SheetsAssistantPort) {}

    async execute(rawQuestion: string, sessionId: string): Promise<AssistantAnswer> {
        const question = rawQuestion.trim();
        if (question.length === 0) throw new InvalidQuestionError('Question must not be empty');
        if (question.length > MAX_QUESTION_LENGTH) {
            throw new InvalidQuestionError(
                `Question is longer than ${String(MAX_QUESTION_LENGTH)} characters`,
            );
        }
        if (sessionId.trim().length === 0)
            throw new InvalidQuestionError('Session id must not be empty');
        return this.assistant.ask(question, sessionId);
    }
}
