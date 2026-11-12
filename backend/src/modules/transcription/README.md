# transcription

Два сценария:

- расшифровка голосовых сообщений Telegram (до 3 минут, без разделения на собеседников). Модуль экспортирует для этого только `TranscribeVoiceUseCase`;
- расшифровка записей встреч с разделением на собеседников (раздел «Расшифровка встреч» ниже). Она живёт в `meeting/`, запускается сама по событию `file.uploaded` из модуля `files` и отдаётся через `GET /transcripts/:fileId`.

Голосовой сценарий подключается в модуль, которому нужен голос (сейчас это `telegram`), и сам ни от кого не зависит.

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

## Расшифровка встреч

Запись встречи загружается через `POST /files` модуля `files`. Если файл получил `kind: recording`, расшифровка стартует сама:

1. Подписчик outbox `StartMeetingTranscriptionOnFileUploaded` на `file.uploaded` создаёт строку `meeting_transcript` со статусом `pending` (вставка идемпотентна) и ставит job в очередь BullMQ `meeting-transcription` с `jobId = fileId` (дубль отбрасывается). Подписчик нетранзакционный: строка коммитится до постановки job'а, иначе воркер мог бы взять job раньше коммита.
2. `MeetingTranscriptionProcessor` (`MEETING_TRANSCRIPTION_CONCURRENCY` записей параллельно) вызывает `TranscribeMeetingUseCase`: статус `processing`, поток записи через `OpenFileForProcessingUseCase`, расшифровка через `MeetingTranscriberPort`.
3. В одной транзакции сохраняются сегменты, финальный статус и событие `meeting-transcript.completed` (или `meeting-transcript.failed`). Затем снимается удержание записи (`ReleaseFileHoldUseCase`), и она удаляется через `FILES_RECORDING_RETENTION_DAYS`. Расшифровка остаётся и после удаления записи.

### API

Bearer-токен обязателен, Swagger: `/docs`, тег `transcripts`. Чужая и несуществующая расшифровка дают 404 `MEETING_TRANSCRIPT_NOT_FOUND`.

- `GET /transcripts/:fileId` → `{ fileId, status, failureReason, language, durationSec, speakerCount, segments, completedAt }`. `status`: `pending`, `processing`, `completed`, `no_speech`, `failed`. `segments` (`[{ speaker: "Спикер 1", start, end, text }]`, время в секундах от начала записи) приходят только в финальном статусе, иначе `null`. `failureReason`: `provider-unavailable`, `unsupported-media`, `too-long`, `timeout`, `file-deleted`.
- `POST /transcripts/:fileId/retry` → 202 и статус `pending`. Только для `failed` (иначе 409 `MEETING_TRANSCRIPTION_NOT_RETRYABLE`) и пока запись хранится (иначе 410 `FILE_GONE`). Удержание записи и статус `pending` сохраняются в одной транзакции, job ставится после коммита с новым `jobId`. Если job поставить не удалось, расшифровка возвращается в `failed` с прежней причиной, удержание снимается.

Срок хранения записи и сама загрузка описаны в `../files/README.md`. Расшифровки хранятся без срока, в таблице `meeting_transcript` (миграция `db/migrations/021_meeting_transcripts.sql`, сегменты в `JSONB`).

### Как режется длинная запись

`ChunkedMeetingTranscriber`:

- поток из S3 пишется во временную папку (`mkdtemp` в `os.tmpdir()`), `ffprobe` даёт длительность. Запись длиннее `MEETING_TRANSCRIPTION_MAX_DURATION_SEC` дают `failed('too-long')`, нечитаемый файл — `failed('unsupported-media')`;
- запись делится на куски по `MEETING_TRANSCRIPTION_CHUNK_SEC` с перекрытием `MEETING_TRANSCRIPTION_CHUNK_OVERLAP_SEC`. `ffmpeg` перекодирует каждый кусок в mono 16 кГц opus 32 кбит/с, видео отбрасывается. Так часовой WAV не упирается в лимит тела OpenRouter (25 МБ) и в обрыв апстрима через 60 с;
- куски идут последовательно. В начало каждого следующего куска подклеиваются образцы голоса уже известных спикеров (до `MEETING_TRANSCRIPTION_MAX_EXEMPLARS` по `MEETING_TRANSCRIPTION_EXEMPLAR_SEC` с), и `SpeakerRegistry` по ним сопоставляет метки куска со сквозными «Спикер N». Запасной путь — совпадение слов в зоне перекрытия. Сопоставление — «лучшее усилие»: неузнанный голос получает новую метку;
- `TranscriptMerger` режет стык по середине перекрытия, группирует слова в сегменты по смене спикера и нумерует спикеров по первому появлению;
- временная папка удаляется всегда.

### Сбои и повторы

- Кусок: таймаут `MEETING_TRANSCRIPTION_CHUNK_TIMEOUT_MS`, до 2 повторов внутри попытки. 429, 5xx, таймаут, 401 и 403 — временные ошибки (401/403 пишутся в лог как ошибка конфигурации ключа); 400, 413, 422 — постоянные.
- Job: `MEETING_TRANSCRIPTION_ATTEMPTS` попыток, backoff экспоненциальный от 30 с. Постоянная ошибка или последняя попытка дают `failed`, событие `meeting-transcript.failed` и снятие удержания. Постоянная ошибка не повторяется (`UnrecoverableError`).
- Попытка ограничена дедлайном `MEETING_TRANSCRIPTION_JOB_TIMEOUT_MS` (2 ч): по нему прерываются `ffmpeg`, `ffprobe` и запросы к провайдеру, расшифровка сразу получает `failed('timeout')` без повторов.
- Если job окончательно упал вне use case (ошибка БД при смене статуса, сбой сохранения, воркер упал и job завис сверх `maxStalledCount`), процессор переводит незавершённую расшифровку в `failed('provider-unavailable')` и снимает удержание (`FailMeetingTranscriptionUseCase`).
- Если запись удалили, а расшифровка не завершена, подписчик на `file.deleted` закрывает её: `failed('timeout')`, если запись удалила очистка по максимуму удержания, и `failed('file-deleted')`, если её удалил владелец. Так расшифровка не остаётся в `pending` навсегда, а повтор отвечает 410, а не 409.
- Финальный статус ставится только из незавершённого: job и `FailMeetingTranscriptionUseCase` читают расшифровку `SELECT … FOR UPDATE` в транзакции, и job сохраняет результат, только если расшифровка всё ещё в `processing` с номером его попытки. Иначе результат отбрасывается без второго события. Если job застал запись уже удалённой, расшифровка получает `failed('file-deleted')`.
- Если удержание снять не удалось, расшифровка не теряется: запись удалится по максимуму удержания (`FILES_MAX_HOLD_DAYS` + 1 день).

### Переменные окружения

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL` | — | Общие с голосовым сценарием |
| `MEETING_TRANSCRIPTION_MODEL` | `elevenlabs/scribe-v2` | Модель STT с диаризацией |
| `MEETING_TRANSCRIPTION_LANGUAGE` | не задан | Код языка (например, `ru`); пусто — автоопределение |
| `MEETING_TRANSCRIPTION_MAX_DURATION_SEC` | `14400` | Максимум длительности записи (4 ч) |
| `MEETING_TRANSCRIPTION_CHUNK_SEC` | `600` | Длина куска |
| `MEETING_TRANSCRIPTION_CHUNK_OVERLAP_SEC` | `30` | Перекрытие соседних кусков, меньше длины куска |
| `MEETING_TRANSCRIPTION_MAX_CHUNK_BYTES` | `20971520` | Предел размера куска после перекодирования; превышение — ошибка конфигурации |
| `MEETING_TRANSCRIPTION_CHUNK_TIMEOUT_MS` | `90000` | Таймаут запроса на кусок |
| `MEETING_TRANSCRIPTION_MAX_EXEMPLARS` | `8` | Сколько образцов голоса подклеивать |
| `MEETING_TRANSCRIPTION_EXEMPLAR_SEC` | `10` | Длина одного образца |
| `MEETING_TRANSCRIPTION_ATTEMPTS` | `3` | Попытки job'а |
| `MEETING_TRANSCRIPTION_CONCURRENCY` | `2` | Записи, которые воркер обрабатывает параллельно |
| `MEETING_TRANSCRIPTION_JOB_TIMEOUT_MS` | `7200000` | Дедлайн одной попытки; по истечении — `failed('timeout')` |

### Требования к окружению

- `ffmpeg` и `ffprobe` в образе: `Dockerfile.dev` ставит их через `apk add --no-cache ffmpeg` (прод-образу нужно то же). При старте модуль проверяет `ffmpeg -version`; если команды нет, в лог пишется ошибка, а записи получают `failed('provider-unavailable')`.
- Свободное место во временной папке: около 2 × `FILES_MAX_RECORDING_MB` × `MEETING_TRANSCRIPTION_CONCURRENCY` (исходная запись плюс куски), при значениях по умолчанию — около 4 ГБ. Каждый кусок удаляется сразу после ответа провайдера, папка попытки — в конце. Папки `meeting-transcription-*` старше суток (остались от упавшего процесса) удаляются при старте модуля.
- Reverse proxy перед бэкендом должен пропускать большие тела запросов: `client_max_body_size` у nginx не меньше лимита записи (см. `../files/README.md`).

### Куда уходят записи

Куски записи (перекодированные в opus, вместе с образцами голоса) отправляются в OpenRouter (`POST {OPENROUTER_BASE_URL}/audio/transcriptions`), а OpenRouter передаёт их провайдеру модели — ElevenLabs (`elevenlabs/scribe-v2`). Прямого обращения к ElevenLabs нет. Запрет логирования запросов настраивается в настройках приватности аккаунта OpenRouter. Исходная запись хранится только в нашем S3 и удаляется по сроку.

В лог пишутся `fileId`, размер, длительность, число спикеров, число попыток, время, исход и код ошибки. Текст расшифровки, аудио и имя файла в лог не попадают.

### Структура `meeting/`

- `domain`: `MeetingTranscript` (агрегат), `planChunks`, `SpeakerRegistry`, `TranscriptMerger`, `DiarizedTranscript`, сегменты, статусы, события, порты (`AudioChunkerPort`, `ChunkTranscriberPort`, `MeetingTranscriberPort`, `MeetingTranscriptRepositoryPort`, `MeetingTranscriptionQueuePort`).
- `application`: подписчики на `file.uploaded` и `file.deleted`, `TranscribeMeetingUseCase`, `FailMeetingTranscriptionUseCase`, `GetMeetingTranscriptUseCase`, `RetryMeetingTranscriptionUseCase`.
- `infrastructure`: `ChunkedMeetingTranscriber`, `AudioChunker`, `ChunkTranscriber`, `MeetingTranscriptRepository`, очередь `meeting-transcription` (`MeetingTranscriptionQueue`, `MeetingTranscriptionProcessor`).
- `interface`: `MeetingTranscriptsController`, коды ошибок → HTTP-статусы.
- `contracts`: регистрация событий `meeting-transcript.completed` и `meeting-transcript.failed`.
- `testing`: фейки, in-memory репозиторий и обезличенные фикстуры ответов провайдера.
