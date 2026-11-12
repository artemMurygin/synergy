import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../../shared/config/env.schema';
import type { ChatModelSetting } from '../../../shared/llm';
import type { ExtractMeetingTasksSettings } from './application/extract-meeting-tasks.use-case';

export const DEFAULT_MEETING_TASKS_MODEL = 'anthropic/claude-haiku-5.5';

const WINDOW_OVERLAP_SECONDS = 2 * 60;
const SECONDS_PER_MINUTE = 60;

export function meetingTasksModelSetting(config: ConfigService<Env, true>): ChatModelSetting {
    const configured: string | undefined = config.get('MEETING_TASKS_EXTRACTION_MODEL', {
        infer: true,
    });
    return { name: configured ?? DEFAULT_MEETING_TASKS_MODEL, provider: 'openrouter' };
}

export function meetingTasksExtractionSettingsFromConfig(
    config: ConfigService<Env, true>,
): ExtractMeetingTasksSettings {
    return {
        windowTokens: config.get('MEETING_TASKS_WINDOW_TOKENS', { infer: true }),
        windowSec: config.get('MEETING_TASKS_WINDOW_MINUTES', { infer: true }) * SECONDS_PER_MINUTE,
        overlapSec: WINDOW_OVERLAP_SECONDS,
    };
}
