import { Injectable } from '@nestjs/common';
import { ChatSessionNotFoundError } from '../domain/chat-session-not-found.error';
import { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';
import { ChatThreadPort } from '../domain/ports/chat-thread.port';
import { SheetsAssistantPort, type AssistantAnswer } from '../domain/ports/sheets-assistant.port';

export const MAX_QUESTION_LENGTH = 2000;

export class InvalidQuestionError extends Error {}

@Injectable()
export class AskQuestionUseCase {
    constructor(
        private readonly assistant: SheetsAssistantPort,
        private readonly sessions: ChatSessionRepositoryPort,
        private readonly threads: ChatThreadPort,
    ) {}

    /**
     * Check the session, store the question, ask the agent, store the answer.
     * If the agent fails the question stays in the history and no answer is written.
     * Throws ChatSessionNotFoundError for an unknown session.
     */
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

        const session = await this.sessions.findById(sessionId);
        if (session === null) throw new ChatSessionNotFoundError(sessionId);

        await this.sessions.appendUserMessage(sessionId, question);
        try {
            const answer = await this.assistant.ask(question, sessionId);
            await this.sessions.appendAgentAnswer(
                sessionId,
                answer,
                session.proposeAutoTitle(question),
            );
            return answer;
        } catch (error) {
            await this.dropThreadIfSessionGone(sessionId);
            throw error;
        }
    }

    /** The session may be deleted while the agent works; its checkpoints must not outlive it. */
    private async dropThreadIfSessionGone(sessionId: string): Promise<void> {
        try {
            if ((await this.sessions.findById(sessionId)) === null) {
                await this.threads.deleteThread(sessionId);
            }
        } catch {
            // best effort: the original error is the one to report
        }
    }
}
