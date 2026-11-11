import { describe, expect, it } from 'vitest';
import { buildTasksAgentPrompt } from './tasks-agent-prompt';

describe('buildTasksAgentPrompt(now)', () => {
    it('states the weekday, date and time in Europe/Moscow', () => {
        const prompt = buildTasksAgentPrompt(new Date('2026-11-11T09:05:00.000Z'));

        expect(prompt).toContain('Сейчас: среда, 11.11.2026 12:05, Europe/Moscow (UTC+3).');
    });

    it('rolls over to the next Moscow day when UTC is still on the previous one', () => {
        const prompt = buildTasksAgentPrompt(new Date('2026-11-11T22:30:00.000Z'));

        expect(prompt).toContain('Сейчас: четверг, 12.11.2026 01:30, Europe/Moscow (UTC+3).');
    });

    it('uses a 24-hour clock with leading zeros', () => {
        const prompt = buildTasksAgentPrompt(new Date('2027-01-03T21:00:00.000Z'));

        expect(prompt).toContain('Сейчас: понедельник, 04.01.2027 00:00, Europe/Moscow (UTC+3).');
    });

    it('depends only on now: same instant gives the same prompt', () => {
        const now = new Date('2026-11-11T09:05:00.000Z');

        expect(buildTasksAgentPrompt(now)).toBe(buildTasksAgentPrompt(new Date(now.getTime())));
        expect(buildTasksAgentPrompt(now)).not.toBe(
            buildTasksAgentPrompt(new Date('2026-11-12T09:05:00.000Z')),
        );
    });
});
