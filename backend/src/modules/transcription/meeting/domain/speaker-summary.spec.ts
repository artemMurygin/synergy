import { describe, expect, it } from 'vitest';
import { SpeakerNames } from './speaker-names';
import { summarizeSpeakers } from './speaker-summary';
import { UNRECOGNIZED_SPEAKER } from './transcript-segment';

describe('summarizeSpeakers', () => {
    it('lists numbered speakers only and shares talk time among them', () => {
        const summary = summarizeSpeakers(2, SpeakerNames.empty(), [
            { speaker: 1, talkSec: 30 },
            { speaker: 2, talkSec: 10 },
            { speaker: UNRECOGNIZED_SPEAKER, talkSec: 60 },
        ]);

        expect(summary).toEqual([
            { speaker: 1, name: null, talkSec: 30, talkShare: 0.75 },
            { speaker: 2, name: null, talkSec: 10, talkShare: 0.25 },
        ]);
    });
});
