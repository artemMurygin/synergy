import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AskQuestionUseCase, InvalidQuestionError } from '../../application/ask-question.use-case';

const askSchema = z.object({ question: z.string(), sessionId: z.string() });

@ApiTags('sheets-qa')
@Controller('sheets-qa')
export class SheetsQaController {
    constructor(private readonly askQuestion: AskQuestionUseCase) {}

    @Post('ask')
    async ask(@Body() body: unknown): Promise<{ answer: string }> {
        const parsed = askSchema.safeParse(body);
        if (!parsed.success)
            throw new BadRequestException('Body must be {"question": string, "sessionId": string}');
        try {
            return await this.askQuestion.execute(parsed.data.question, parsed.data.sessionId);
        } catch (error) {
            if (error instanceof InvalidQuestionError) throw new BadRequestException(error.message);
            throw error;
        }
    }
}
