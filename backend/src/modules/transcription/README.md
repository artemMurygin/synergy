# transcription

Два сценария:

- расшифровка голосовых сообщений Telegram (до 3 минут, без разделения на собеседников). Модуль экспортирует для этого только `TranscribeVoiceUseCase`;
- расшифровка записей встреч с разделением на собеседников (раздел «Расшифровка встреч» ниже). Она живёт в `meeting/`, запускается сама по событию `file.uploaded` из модуля `files` и отдаётся через `GET /transcripts/:fileId`. Поверх неё работают имена спикеров, документы встречи (`.docx`), извлечение задач, специалист по встречам в чате ассистента и сообщение в чат о готовой расшифровке.

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
3. В одной транзакции сохраняются сегменты (`TranscriptSegmentRepositoryPort.insertAll`), финальный статус и событие `meeting-transcript.completed` (или `meeting-transcript.failed`). Затем снимается удержание записи (`ReleaseFileHoldUseCase`), и она удаляется через `FILES_RECORDING_RETENTION_DAYS`. Расшифровка остаётся и после удаления записи.

### API

Bearer-токен обязателен, Swagger: `/docs`, тег `transcripts`. Чужая и несуществующая расшифровка дают 404 `MEETING_TRANSCRIPT_NOT_FOUND`.

- `GET /transcripts/:fileId` → `{ fileId, status, failureReason, language, durationSec, speakerCount, speakers, segments, completedAt }`. `status`: `pending`, `processing`, `completed`, `no_speech`, `failed`. `segments` (`[{ seq, speaker, startSec, endSec, text }]`: `seq` с нуля без пропусков, `speaker` — номер спикера с единицы или `0` для реплики «Нераспознан», для которой провайдер не вернул метку собеседника, время в секундах от начала записи) и `speakers` (`[{ speaker, name, talkSec, talkShare }]`, все спикеры `1..speakerCount` без «Нераспознан», `name: null` — метка «Спикер N», `talkShare` — доля 0..1) приходят только у готовой расшифровки (`completed`, `no_speech`; у `no_speech` списки пустые), иначе `null`. `failureReason`: `provider-unavailable`, `unsupported-media`, `too-long`, `timeout`, `file-deleted`.
- `PUT /transcripts/:fileId/speakers` с телом `{ speakers: [{ speaker, name }] }` → 200 и `{ speakers }` в той же форме. Имена назначаются одним вызовом, всё или ничего. Пустое имя или `null` сбрасывает спикера к метке «Спикер N». Одно имя может стоять у нескольких спикеров. 409 `MEETING_TRANSCRIPT_NOT_READY`, если расшифровка не `completed`; 422 `MEETING_TRANSCRIPT_UNKNOWN_SPEAKER` (номера нет в `1..speakerCount`) или `MEETING_TRANSCRIPT_INVALID_SPEAKER_NAME` (длина после обрезки пробелов не 1–100 символов), и тогда ни одно имя не меняется. Текст реплик не меняется никогда.
- `POST /transcripts/:fileId/retry` → 202 и статус `pending`. Только для `failed` (иначе 409 `MEETING_TRANSCRIPTION_NOT_RETRYABLE`) и пока запись хранится (иначе 410 `FILE_GONE`). Удержание записи и статус `pending` сохраняются в одной транзакции, job ставится после коммита с новым `jobId`. Если job поставить не удалось, расшифровка возвращается в `failed` с прежней причиной, удержание снимается.

Срок хранения записи и сама загрузка описаны в `../files/README.md`. Расшифровки хранятся без срока.

### Сегменты и имена спикеров

- `meeting_transcript` (миграция `021_meeting_transcripts.sql`) — сама расшифровка: статус, причина сбоя, язык, длительность, число спикеров.
- `meeting_transcript_segment` (миграция `022_meeting_transcript_segments.sql`) — реплики: `(file_id, seq)`, номер спикера, `start_sec`, `end_sec`, `text`. Пишутся один раз вместе с финальным статусом и дальше только читаются. Сегменты лежат вне агрегата `MeetingTranscript`: их читает `TranscriptSegmentRepositoryPort` целиком (`readAll` по `seq`), статистикой времени речи (`speakerStats`) и выборкой примеров (`samples`: самые длинные реплики каждого спикера, сначала по одной из разных третей записи).
- `meeting_transcript_speaker` — имена спикеров. Строка есть только у спикера с именем: сброс имени удаляет строку. Имена принадлежат агрегату `MeetingTranscript` (`speakerNames`, `assignSpeakers`), сохраняются его репозиторием.

Миграция `022` перенесла сегменты из бывшей колонки `meeting_transcript.segments JSONB`: порядок массива задал `seq`, номер спикера взят из метки «Спикер N». Метка «Спикер N» и имя — только отображение: в данных у сегмента числовой `speaker`. Down-часть миграции записана в комментарии (имена при откате теряются).

Домен: `SpeakerName` (1–100 символов после обрезки), `SpeakerNames` (неизменяемая карта «номер → имя», `labelOf` даёт имя, «Спикер N» или «Нераспознан» для `speaker = 0`; миграция `039` разрешила `speaker = 0` в сегментах), `SpeakerAssignment` (проверенный пункт назначения), `SpeakerSummary` (имя, время и доля речи для API и агента).

### Документы встречи

`MeetingDocuments` собирает `DocumentModel` (`shared/documents`), рендерит его общим генератором `DocumentRendererPort` (адаптер `DocumentRenderer`, `.docx`) и сохраняет как новый файл владельца через порт `MeetingFilesPort` (адаптер `MeetingFiles` вызывает `StoreGeneratedFileUseCase` и `GetFileUseCase` модуля `files`; вид `document`). Каждый вызов даёт новый файл. Источник данных — расшифровка, поэтому документы собираются и после удаления записи.

- `issueTranscript` — «Расшифровка — <имя записи без расширения>.docx»: дата загрузки, длительность, участники (подписи без повторов), реплики `[чч:мм:сс] Имя: текст` с текущими именами. Подряд идущие реплики с одной подписью (в том числе разных спикеров с одним именем) склеиваются. Только для `completed` (иначе `TranscriptNotReadyError`).
- `issueTasks` — «Задачи — <имя записи без расширения>.docx»: дата встречи и таблица «№, Задача, Описание, Исполнитель, Постановщик, Срок, Основание». Постановщик пуст: его выбирают при постановке задач. Основание — `[чч:мм:сс] Спикер: «цитата»`.

В лог пишутся `fileId`, вид документа, число реплик или задач, размер и id документа; текст и имена — нет.

### Извлечение задач

`ExtractMeetingTasksUseCase` берёт готовую расшифровку и ничего не сохраняет: задачи в системе создаёт модуль `tasks` по черновику списка (`ProposeTasksUseCase`, `CreateTasksFromDraftUseCase`), когда пользователь согласится. 404 — чужая, 409 — не `completed`, у `no_speech` — пустой список.

- Реплики уходят в `TaskExtractorPort` строками `[seq] [чч:мм:сс] Имя: текст` вместе с датой встречи и участниками. Если оценка длины (около трёх символов на токен) больше `MEETING_TASKS_WINDOW_TOKENS`, расшифровка режется на окна по `MEETING_TASKS_WINDOW_MINUTES` минут с перекрытием 2 минуты, а результаты окон сливаются вторым вызовом (`merge`).
- `TaskExtractor` — structured output (zod-схема, `functionCalling`), температура 0, промпт запрещает придумывать задачи. Модель — `MEETING_TASKS_EXTRACTION_MODEL`, по умолчанию `anthropic/claude-haiku-5.5`.
- `EvidenceValidator` отбрасывает задачу без названия или без основания: `seq` должен быть в расшифровке, а нормализованная цитата (нижний регистр, «ё» → «е», без внешних кавычек и знаков) — входить в текст этого сегмента. Так выдуманные задачи не доходят до пользователя.
- `MeetingDueDateResolver` переводит срок из речи («до пятницы», «20 ноября») в момент времени по Москве от даты загрузки записи, без названного времени — 18:00. Непонятный срок — `null`.
- Исполнитель — упоминание из речи как есть (`assigneeMention`) или `null`; сопоставление с пользователями делает `tasks`.

В лог пишутся число сегментов, окон, найденных, оставленных и отброшенных задач и время; текст — нет.

### Специалист по встречам

`MeetingsAgentCapability` (`meeting/interface/agent`, имя `meetings`, режим `fork`) — подагент оркестратора профиля `app` модуля `assistant`. Регистрируется под токеном `MEETINGS_AGENT_CAPABILITY` и экспортируется из `TranscriptionModule`. Режим `fork` нужен, потому что специалист находит запись по блоку `[Вложения]` в истории чата (`id=…; имя; recording; размер`) и видит сообщения системы о готовности. Модель — `meetings-agent.config.ts`.

Инструменты (`meeting-tools.ts`), пользователь берётся только из контекста запуска:

- `get_meeting_transcript` — статус, длительность, спикеры с именами и долей речи, подсказка по статусу. С `withDocument=true` у готовой расшифровки прикладывает документ к ответу. Если строки расшифровки ещё нет, а файл — своя активная запись, отвечает `pending`.
- `get_speaker_samples` — спикеры с 2–3 характерными репликами и таймкодами (`GetSpeakerSamplesUseCase`).
- `rename_speakers` — все пары «спикер — имя» одним вызовом (`RenameSpeakersUseCase`) и новый документ расшифровки в ответе.
- `extract_meeting_tasks` — задачи с основаниями и документ со списком, если задачи найдены. В системе задач ничего не создаёт.
- `retry_transcription` — повтор неудавшейся расшифровки, только по просьбе пользователя.

Документы попадают в ответ через `ctx.attachments` (`RunAttachments` из `shared/agent-capability`): клиент получает их карточками, а `assistant` сохраняет их с ответом. Текст расшифровки целиком агенту не отдаётся: только сводки, примеры реплик и задачи. Ожидаемые отказы (не найдена, не готова, неизвестный спикер, запись удалена) возвращаются модели текстом, неизвестные ошибки не глотаются. Создание задач из списка — работа специалиста `tasks`: оркестратор передаёт ему поручение без пересказа списка (`assistant/infrastructure/orchestrator-prompt.ts`).

### Сообщение в чат о результате

`NotifyChatOnTranscriptFinished` — нетранзакционный подписчик outbox на `meeting-transcript.completed` и `meeting-transcript.failed` (имена подписчиков `transcription.notify-chat-on-transcript-completed` и `…-failed`). Живёт в отдельном `MeetingChatModule`, потому что `assistant` сам зависит от `transcription` (специалист по встречам): так зависимости обходятся без цикла.

1. Чат ищется через `MeetingChatPort.findChatOfRecording` — первый чат владельца, куда отправили запись (`FindFirstChatOfFileUseCase` модуля `assistant`). Нет такого чата или он удалён — сообщения нет, в другие чаты с этой записью оно не уходит.
2. `completed` — новый документ расшифровки (`issueTranscript`) и текст «Расшифровка готова: N спикеров, чч:мм:сс…» с подсказками про имена и задачи. `no_speech` и `failed` — понятная причина; для `provider-unavailable` и `timeout` — предложение повторить, если запись ещё хранится, иначе просьба загрузить заново. `failed('file-deleted')` (запись удалил владелец) ничего не даёт. Тексты — `transcript-finished-texts.ts`.
3. Сообщение уходит через `MeetingChatPort.post` (адаптер `AssistantMeetingChat` → `PostSystemMessagePort` модуля `assistant`) с ключом идемпотентности, равным id события, темой `meeting-transcript.ready` или `meeting-transcript.failed` и объектом `{ fileId, fileName }` для уведомлений. Доставка асинхронная: сообщение ждёт окончания текущего ответа в чате (см. `../assistant/README.md`, «Сообщения системы»).

### Целая запись одним запросом

`WholeFileMeetingTranscriber`:

- поток из S3 пишется во временную папку (`mkdtemp` в `os.tmpdir()`), `ffprobe` даёт длительность. Запись длиннее `MEETING_TRANSCRIPTION_MAX_DURATION_SEC` или сжатый файл больше `MEETING_TRANSCRIPTION_MAX_AUDIO_BYTES` дают `failed('too-long')` до обращения к провайдеру, нечитаемый файл — `failed('unsupported-media')`;
- `ffmpeg` один раз перекодирует всю дорожку в mono 16 кГц opus 32 кбит/с (видео отбрасывается), без нарезки;
- один `POST {OPENROUTER_BASE_URL}/audio/transcriptions` (JSON, `input_audio` base64 `ogg`, `MEETING_TRANSCRIPTION_MODEL`, диаризация, слова), без повторной диаризации и без fallback на куски. Тайминги отсчитываются от начала всей записи;
- слова превращаются в сегменты по смене спикера, спикеры нумеруются по первому появлению;
- временная папка удаляется всегда; нарезки на куски нет, её переменные окружения удалены;
- слова без метки собеседника попадают в реплики «Нераспознан» (`speaker = 0`), не занимают номер и не входят в `speakerCount`.

### Сбои и повторы

- Запрос: таймаут `MEETING_TRANSCRIPTION_STT_TIMEOUT_MS`, повторы только на уровне job'а. Сеть, 429, 5xx и таймаут — временные ошибки; если таймаут случился и на последней попытке, итог — `failed('timeout')`. 400, 401 и 403 — сбой конфигурации (модель, параметры или ключ; лог уровня error без значения ключа), тоже временные: файл к этому моменту уже проверен `ffprobe`/`ffmpeg`. 413 — `too-long`, 415/422 — `unsupported-media`, без повторов.
- Job: `MEETING_TRANSCRIPTION_ATTEMPTS` попыток, backoff экспоненциальный от 30 с. Постоянная ошибка или последняя попытка дают `failed`, событие `meeting-transcript.failed` и снятие удержания. Постоянная ошибка не повторяется (`UnrecoverableError`).
- Попытка ограничена дедлайном `MEETING_TRANSCRIPTION_JOB_TIMEOUT_MS` (2 ч): по нему прерываются `ffmpeg`, `ffprobe` и запросы к провайдеру, расшифровка сразу получает `failed('timeout')` без повторов.
- Если job окончательно упал вне use case (ошибка БД при смене статуса, сбой сохранения, воркер упал и job завис сверх `maxStalledCount`), процессор переводит незавершённую расшифровку в `failed('provider-unavailable')` и снимает удержание (`FailMeetingTranscriptionUseCase`).
- Если запись удалили, а расшифровка не завершена, подписчик на `file.deleted` закрывает её: `failed('timeout')`, если запись удалила очистка по максимуму удержания, и `failed('file-deleted')`, если её удалил владелец. Так расшифровка не остаётся в `pending` навсегда, а повтор отвечает 410, а не 409.
- Финальный статус ставится только из незавершённого: job и `FailMeetingTranscriptionUseCase` читают расшифровку `SELECT … FOR UPDATE` в транзакции, и job сохраняет результат, только если расшифровка всё ещё в `processing` с номером его попытки. Иначе результат отбрасывается без второго события. Если job застал запись уже удалённой, расшифровка получает `failed('file-deleted')`.
- Если удержание снять не удалось, расшифровка не теряется: запись удалится по максимуму удержания (`FILES_MAX_HOLD_DAYS` + 1 день).

### Переменные окружения

| Переменная                                  | По умолчанию                 | Назначение                                                                                                        |
| ------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL` | —                            | Ключ и адрес OpenRouter: расшифровка встреч, голосовые Telegram, извлечение задач                                 |
| `MEETING_TRANSCRIPTION_MODEL`               | `elevenlabs/scribe-v2`       | Модель STT OpenRouter с диаризацией                                                                               |
| `MEETING_TRANSCRIPTION_STT_TIMEOUT_MS`      | `240000`                     | Таймаут HTTP-запроса на всю запись; не больше 290000 и дедлайна job'а                                             |
| `MEETING_TRANSCRIPTION_MAX_AUDIO_BYTES`     | `18000000`                   | Предел размера сжатого файла; проверяется до отправки. В base64 с JSON укладывается в лимит тела OpenRouter 25 МБ |
| `MEETING_TRANSCRIPTION_LANGUAGE`            | не задан                     | Код языка (например, `ru`); пусто — автоопределение                                                               |
| `MEETING_TRANSCRIPTION_MAX_DURATION_SEC`    | `4500`                       | Максимум длительности записи (75 мин)                                                                             |
| `MEETING_TRANSCRIPTION_ATTEMPTS`            | `3`                          | Попытки job'а                                                                                                     |
| `MEETING_TRANSCRIPTION_CONCURRENCY`         | `2`                          | Записи, которые воркер обрабатывает параллельно                                                                   |
| `MEETING_TRANSCRIPTION_JOB_TIMEOUT_MS`      | `7200000`                    | Дедлайн одной попытки; по истечении — `failed('timeout')`                                                         |
| `MEETING_TASKS_EXTRACTION_MODEL`            | `anthropic/claude-haiku-5.5` | Модель извлечения задач                                                                                           |
| `MEETING_TASKS_WINDOW_TOKENS`               | `60000`                      | Порог оценки токенов, после которого расшифровка режется на окна                                                  |
| `MEETING_TASKS_WINDOW_MINUTES`              | `30`                         | Длина окна в минутах (перекрытие 2 минуты)                                                                        |

### Требования к окружению

- `ffmpeg` и `ffprobe` в образе: `Dockerfile.dev` ставит их через `apk add --no-cache ffmpeg` (прод-образу нужно то же). Если `ffprobe` нет, попытка получает временную ошибку, а после всех попыток запись получает `failed('provider-unavailable')`.
- Свободное место во временной папке: около 2 × `FILES_MAX_RECORDING_MB` × `MEETING_TRANSCRIPTION_CONCURRENCY` (исходная запись плюс сжатая копия), при значениях по умолчанию — около 4 ГБ. Папка попытки удаляется в конце. Папки `meeting-transcription-*` старше суток (остались от упавшего процесса) удаляются при старте модуля.
- Reverse proxy перед бэкендом должен пропускать большие тела запросов: `client_max_body_size` у nginx не меньше лимита записи (см. `../files/README.md`).

### Куда уходят записи

Сжатая запись целиком отправляется в OpenRouter (`POST {OPENROUTER_BASE_URL}/audio/transcriptions`) с ключом `OPENROUTER_API_KEY`; ключ и текст в логи не попадают. Исходная запись хранится только в нашем S3 и удаляется по сроку.

В лог пишутся `fileId`, размер, длительность, число спикеров, число попыток, время, исход и код ошибки. Текст расшифровки, аудио и имя файла в лог не попадают.

### Структура `meeting/`

- `domain`: `MeetingTranscript` (агрегат), `DiarizedTranscript`, сегменты, статусы, события, `SpeakerName`, `SpeakerNames`, `SpeakerAssignment`, `SpeakerSummary`, `MeetingDocumentKind`, `EvidenceValidator`, `MeetingDueDateResolver`, `ExtractedMeetingTask`, порты (`MeetingAudioPreparerPort`, `WholeFileSttPort`, `MeetingTranscriberPort`, `MeetingTranscriptRepositoryPort`, `TranscriptSegmentRepositoryPort`, `MeetingTranscriptionQueuePort`, `TaskExtractorPort`, `MeetingChatPort`).
- `application`: подписчики на `file.uploaded` и `file.deleted`, `TranscribeMeetingUseCase`, `FailMeetingTranscriptionUseCase`, `GetMeetingTranscriptUseCase`, `RetryMeetingTranscriptionUseCase`, `RenameSpeakersUseCase`, `GetSpeakerSamplesUseCase`, `ExtractMeetingTasksUseCase`, `MeetingDocuments`, подписчик `NotifyChatOnTranscriptFinished`.
- `infrastructure`: `WholeFileMeetingTranscriber`, `MeetingAudioPreparer`, `WholeFileStt`, `TaskExtractor`, `MeetingTranscriptRepository`, `TranscriptSegmentRepository`, `AssistantMeetingChat`, очередь `meeting-transcription` (`MeetingTranscriptionQueue`, `MeetingTranscriptionProcessor`).
- `interface`: `MeetingTranscriptsController`, коды ошибок → HTTP-статусы, `agent/` — специалист по встречам (`MeetingsAgentCapability`, инструменты, промпт, модель).
- `meeting-chat.module.ts`: `MeetingChatModule` — сообщение в чат о результате.
- `contracts`: регистрация событий `meeting-transcript.completed` и `meeting-transcript.failed`.
- `testing`: фейки, in-memory репозиторий и обезличенные фикстуры ответов провайдера.
