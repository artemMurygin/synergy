import { BadRequestException, Body, Controller, NotFoundException, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AskQuestionUseCase, InvalidQuestionError } from '../../application/ask-question.use-case';
import { ChatSessionNotFoundError } from '../../domain/chat-session-not-found.error';

const askSchema = z.object({ question: z.string(), sessionId: z.string() });
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@ApiTags('sheets-qa')
@Controller('sheets-qa')
export class SheetsQaController {
    constructor(private readonly askQuestion: AskQuestionUseCase) {}

    @Post('ask')
    async ask(@Body() body: unknown): Promise<{ answer: string }> {
        const parsed = askSchema.safeParse(body);
        if (!parsed.success)
            throw new BadRequestException('Body must be {"question": string, "sessionId": string}');
        // A malformed id cannot belong to any session; avoid a Postgres uuid cast error.
        if (!UUID_PATTERN.test(parsed.data.sessionId.trim()) && parsed.data.sessionId.trim() !== '')
            throw new NotFoundException(`Chat session not found: ${parsed.data.sessionId}`);
        try {
            return await this.askQuestion.execute(parsed.data.question, parsed.data.sessionId);
        } catch (error) {
            if (error instanceof InvalidQuestionError) throw new BadRequestException(error.message);
            if (error instanceof ChatSessionNotFoundError)
                throw new NotFoundException(error.message);
            throw error;
        }
    }
}
