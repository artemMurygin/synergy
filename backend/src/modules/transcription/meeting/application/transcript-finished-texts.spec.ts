import { describe, expect, it } from 'vitest';
import { transcriptFinishedText } from './transcript-finished-texts';

describe('transcriptFinishedText', () => {
    it('says the speakers were not recognized when no speaker got a number', () => {
        expect(
            transcriptFinishedText({ kind: 'completed', speakerCount: 0, durationSec: 65 }),
        ).toBe(
            'Расшифровка готова: собеседники не распознаны, 00:01:05. Можно сразу перейти к задачам: напишите «извлеки задачи».',
        );
    });
});
