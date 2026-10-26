import { BadRequestException, PipeTransform } from '@nestjs/common';
import { z } from 'zod';

export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform {
    constructor(private readonly schema: T) {}

    transform(value: unknown): z.infer<T> {
        const result = this.schema.safeParse(value);
        if (!result.success) {
            throw new BadRequestException(z.prettifyError(result.error));
        }
        return result.data;
    }
}
