import { TranscriptionTemporaryError } from '../../domain/errors';
import { DiarizedTranscript } from '../../domain/diarized-transcript';
import type { WholeFileTranscription, WholeFileWord } from '../../domain/ports/whole-file-stt.port';
import { TranscriptSegment } from '../../domain/transcript-segment';

interface SpeechWord {
    readonly text: string;
    readonly start: number;
    readonly end: number;
    readonly speakerId: string;
}

interface Group {
    readonly speakerId: string;
    readonly start: number;
    end: number;
    readonly texts: string[];
}

/**
 * Единый ответ провайдера -> доменная расшифровка. Берутся только элементы `word` с валидными
 * временем, текстом и спикером; подряд идущие слова одного спикера склеиваются в сегмент,
 * спикеры нумеруются с единицы по первому появлению. Нет речи -> пустые сегменты (`no_speech`).
 * Если слова речи есть, но ни одно не валидно, ответ некорректен: бросает
 * `TranscriptionTemporaryError`, пустой успех не возвращается. Текст в ошибку не попадает.
 */
export function wordsToTranscript(
    response: Pick<WholeFileTranscription, 'language' | 'words'>,
    durationSec: number,
): DiarizedTranscript {
    const speechItems = response.words.filter((item) => item.type === 'word');
    const words = speechItems.flatMap((item) => toSpeechWord(item) ?? []);
    if (speechItems.length > 0 && words.length === 0) {
        throw new TranscriptionTemporaryError('Provider returned an invalid response', undefined, {
            reason: 'invalid_response',
        });
    }

    const ordered = words
        .map((word, index) => ({ word, index }))
        .sort((a, b) => a.word.start - b.word.start || a.index - b.index)
        .map(({ word }) => word);

    const speakers = new Map<string, number>();
    const groups: Group[] = [];
    for (const word of ordered) {
        if (!speakers.has(word.speakerId)) speakers.set(word.speakerId, speakers.size + 1);
        const last = groups.at(-1);
        if (last?.speakerId === word.speakerId) {
            last.end = Math.max(last.end, word.end);
            last.texts.push(word.text);
        } else {
            groups.push({
                speakerId: word.speakerId,
                start: word.start,
                end: word.end,
                texts: [word.text],
            });
        }
    }
    const segments = groups.map((group, seq) =>
        TranscriptSegment.of({
            seq,
            speaker: speakers.get(group.speakerId) ?? 1,
            startSec: group.start,
            endSec: group.end,
            text: group.texts.join(' '),
        }),
    );

    return DiarizedTranscript.of({ language: response.language, durationSec, segments });
}

function toSpeechWord(item: WholeFileWord): SpeechWord | null {
    const { text, start, end, speakerId } = item;
    if (text === null || text.trim() === '') return null;
    if (speakerId === null || speakerId === '') return null;
    if (start === null || end === null) return null;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) return null;
    return { text: text.trim(), start, end, speakerId };
}
