# transcription

Расшифровка голосовых сообщений в текст. Модуль экспортирует только `TranscribeVoiceUseCase`. Он подключается в модуль, которому нужен голос (сейчас это `telegram`), и сам ни от кого не зависит.

## Как пользоваться

```ts
const clip = VoiceClip.of({ audio, mimeType: 'audio/ogg', durationSec: voice.duration });
const result = await transcribeVoice.execute(clip);
// { kind: 'text', text } | { kind: 'no-speech' } | { kind: 'rejected', reason }
```

`reason` бывает `too-long`, `too-large`, `unsupported-format` или `provider-unavailable`. Use case не бросает исключений: каждый исход приходит результатом, и по нему вызывающий формулирует ответ пользователю.

## Правила

- Лимиты проверяются до вызова провайдера: длительность до 3 минут (`MAX_VOICE_DURATION_SEC`, берётся из `voice.duration` Telegram), размер до 5 МБ (`MAX_VOICE_SIZE_BYTES`), формат аудио (`ogg`, `mp3`, `wav` по `mimeType`).
- Таймаут провайдера 30 с (`TRANSCRIPTION_TIMEOUT_MS`). По таймауту запрос отменяется через `AbortSignal`. Таймаут и любая ошибка провайдера дают `rejected('provider-unavailable')`.
- В лог пишутся длительность, размер, исход, время и вид сбоя. Аудио и текст расшифровки в лог не попадают.

## Провайдер

`Transcriber` отправляет `POST {OPENROUTER_BASE_URL}/chat/completions` с `input_audio` (base64). Это тот же вызов, что в бенчмарке. Настройки берутся из env:

- `TRANSCRIPTION_MODEL`, по умолчанию `google/gemini-3.1-flash-lite`;
- `OPENROUTER_API_KEY`;
- `OPENROUTER_BASE_URL`.

Голосовые Telegram (`ogg/opus`) уходят как есть, `ffmpeg` не нужен: модель принимает `format: 'ogg'` (спайк 1.2).

Промпт просит дословную расшифровку без комментариев, а при отсутствии речи ответ `NO_SPEECH`. Без этой оговорки модель на тишину выдумывает фразу. Пустой ответ, маркер или служебная фраза вроде «[тишина]» дают `no-speech`.

## Структура

- `domain`: `VoiceClip`, `TranscriptionResult`, порт `TranscriberPort`, ошибки.
- `application`: `TranscribeVoiceUseCase` и тестовые двойники (`FakeTranscriber`, `recordingLogger`).
- `infrastructure`: `Transcriber` (`infrastructure/openrouter/transcriber.ts`).
- `bench`: бенчмарк моделей распознавания (`node bench/transcribe-bench.mjs --help`). Записи и результаты лежат только локально, в git не попадают (`bench/.gitignore`).
