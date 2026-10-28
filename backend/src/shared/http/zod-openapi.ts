import type { ApiBodyOptions } from '@nestjs/swagger';
import { z } from 'zod';

type OpenApiSchema = Extract<ApiBodyOptions, { schema: unknown }>['schema'];

/** JSON Schema из zod-схемы в формате OpenAPI 3 для `@ApiBody({ schema })`. */
export function zodToOpenApi(schema: z.ZodType): OpenApiSchema {
    const { $schema: _ignored, ...json } = z.toJSONSchema(schema, { target: 'openapi-3.0' });
    return json as OpenApiSchema;
}
