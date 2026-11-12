# Architecture: add-file-storage

## Scope
Только backend и инфраструктура:
- сервис MinIO в `docker-compose`;
- новый модуль `files`;
- расшифровка встреч в модуле `transcription` (новая папка `meeting/`, `TranscribeVoiceUseCase` не трогаем);
- общий корень BullMQ в `shared/queue`.

Клиенты не меняются.

---

## Backend — Domain Model

### Entities
| Name | Status (new/existing) | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `StoredFile` (files) | new | да | `id`, `ownerId`, `name`, `mediaType`, `kind`, `sizeBytes`, `storageKey`, `status`, `retention`, `uploadedAt`, `deletedAt` | Файл пользователя в MinIO и его срок хранения. Строка не удаляется физически, только `status = deleted` |
| `MeetingTranscript` (transcription) | new | да | `fileId` (PK), `ownerId`, `status`, `failureReason`, `language`, `durationSec`, `speakerCount`, `segments`, `attempts`, `completedAt` | Расшифровка записи с собеседниками. Живёт дольше файла |

### Aggregates
| Aggregate | Root entity | Входит в состав (entities/VO) | Инварианты, которые защищает |
|---|---|---|---|
| `StoredFile` | `StoredFile` | `FileName`, `MediaType`, `Retention` | Владелец и `storageKey` не меняются. `deleted` — конечный статус. У `recording` до снятия удержания `expiresAt = null`, у `document` всегда есть `expiresAt`. Снять удержание можно только у `recording`. Повторное `markDeleted` ничего не делает |
| `MeetingTranscript` | `MeetingTranscript` | `TranscriptSegment` | Переходы: `pending → processing → completed / no_speech / failed`, `failed → pending` только через `retry`. Сегменты есть только при `completed`. `failureReason` есть только при `failed`. `speakerCount` равен числу различных меток в сегментах |

### Value Objects
| Name | Поля | Почему VO (immutable/self-validating) |
|---|---|---|
| `FileName` (files) | `value: string` | Самопроверка: непустое имя, до 255 символов, без `/`, `\` и управляющих символов (обрезаются). Кириллица допустима |
| `MediaType` (files) | `mime: string`, `kind: 'recording' \| 'document'` | Создаётся только из белого списка. `kind` выводится из `mime`, а не передаётся отдельно |
| `Retention` (files) | `heldUntil: Date \| null`, `expiresAt: Date \| null` | Неизменяемая пара. Ровно одно из полей задано, пока файл активен |
| `FileKind` (files) | `'recording' \| 'document'` | Закрытое множество |
| `TranscriptSegment` (transcription) | `speaker: string`, `start: number`, `end: number`, `text: string` | Самопроверка: `0 ≤ start ≤ end`, текст непустой |
| `DiarizedTranscript` (transcription) | `language`, `durationSec`, `segments: TranscriptSegment[]` | Результат после склейки кусков: сегменты по времени от начала записи, соседние одного спикера склеены |
| `ChunkPlan` (transcription) | `index`, `startSec`, `endSec` | Самопроверка: `startSec < endSec` |
| `AudioChunk` (transcription) | `ChunkPlan` + `path`, `sizeBytes`, `prefixSec`, `exemplarLayout` | Отрендеренный файл куска с раскладкой образцов; размер ≤ лимита |
| `SpeakerExemplar` (transcription) | `globalSpeakerId`, `sourceStartSec`, `durationSec` | Образец голоса глобального спикера в абсолютном времени записи, 4–10 с |
| `ChunkWord` (transcription) | `text`, `start`, `end`, `speaker` | Слово провайдера с локальной меткой спикера куска |
| `TranscriptionStatus` (transcription) | `'pending' \| 'processing' \| 'completed' \| 'no_speech' \| 'failed'` | Закрытое множество |
| `TranscriptionFailureReason` (transcription) | `'provider-unavailable' \| 'unsupported-media' \| 'too-long' \| 'timeout' \| 'file-deleted'` | Закрытое множество для API |
| `TranscriptionUsage` (transcription) | `seconds: number`, `cost: number` | Сколько провайдер расшифровал и сколько это стоило; суммируется по кускам, только для лога |
| `FileUploaded` (files, событие) | `fileId`, `ownerId`, `kind`, `mediaType`, `sizeBytes` | Доменное событие, без имени и содержимого |
| `FileDeleted` (files, событие `file.deleted`) | `fileId`, `ownerId`, `kind`, `cause: 'owner' \| 'retention'` | Доменное событие удаления файла владельцем или очисткой, без имени |
| `MeetingTranscriptCompleted` / `MeetingTranscriptFailed` (transcription, события) | `fileId`, `ownerId`, `status` / `reason` | Доменные события, без текста |

### Services
| Service | Слой (application/domain/infrastructure) | Ответственность |
|---|---|---|
| `RetentionPolicy` (files) | domain | Сроки: документ 30 д, запись 1 д после обработки, удержание до 7 д. Считает `Retention` при загрузке и снятии удержания, а также эффективный срок для зависшего удержания |
| `ObjectStoragePort` (files) | domain port | `put` / `get` / `delete` / `ensureBucket` объектов |
| `ObjectStorage` (files, `infrastructure/s3`) | infrastructure | `@aws-sdk/client-s3` + `lib-storage` `Upload`, `forcePathStyle`, лимит байт через `Transform`, `abort` и `delete` при обрыве, `NoSuchKey` → `null` / идемпотентный `delete`. `ensureBucket` на `onModuleInit`: ошибка пишется в лог и не роняет приложение |
| `StoredFileRepositoryPort` / `StoredFileRepository` (files) | domain port / infrastructure | Сохранение, поиск по id, чтение под `FOR UPDATE`, выборка просроченных пачкой |
| `FilesSettingsPort` / `FilesSettings` (files) | domain port / infrastructure | Лимиты загрузки и TTL ссылки из env |
| `FilesClockPort` / `SystemFilesClock` (files) | domain port / infrastructure | Текущее время для сроков |
| `MediaTypeDetector` (files) | infrastructure | `file-type` по первым 4100 байтам, правила для csv/txt (UTF-8) и cfb (xls/doc по расширению) → `MediaType` или `UnsupportedMediaTypeError` |
| `DownloadTokenPort` / `DownloadTokenService` (files, `infrastructure/jwt`) | domain port / infrastructure | JWT с отдельным секретом, `aud: file-download`, `sub: fileId`, TTL 5 мин. Без `FILES_DOWNLOAD_TOKEN_SECRET` подставляется заглушка: `sign` → 503 `FILE_DOWNLOAD_LINKS_UNAVAILABLE`, `verify` → `false` |
| `UploadFileUseCase` (files) | application | Определить тип, выбрать лимит, `put`. В транзакции: `StoredFile.upload` и событие. Компенсация `delete`, если транзакция упала |
| `GetFileUseCase` (files) | application | Метаданные с проверкой владельца (404) |
| `DeleteFileUseCase` (files) | application | В транзакции под `FOR UPDATE`: проверка владельца, `delete` объекта, `markDeleted(now, 'owner')`, событие `FileDeleted`. Идемпотентно |
| `CreateDownloadLinkUseCase` (files) | application | Проверка владельца, активный файл (410 для удалённого), выдача `{ url, expiresAt }` |
| `DownloadFileContentUseCase` (files) | application | Проверка токена (403), активный файл (410), поток и метаданные |
| `PurgeExpiredFilesUseCase` (files) | application | Пачками: просроченные → под `FOR UPDATE` перепроверить срок → `delete` → `markDeleted(now, 'retention')` и событие `FileDeleted`. Ошибки по одному файлу логируются, очистка идёт дальше |
| `OpenFileForProcessingUseCase` (files, экспорт) | application | Поток и метаданные по `fileId` для внутренних модулей. `null`, если файла нет или он удалён |
| `HoldFileUseCase` / `ReleaseFileHoldUseCase` (files, экспорт) | application | Поставить и снять удержание записи, в транзакции под `FOR UPDATE`. `Hold` для удалённого файла бросает `FileGoneError` |
| `FilesPurgeScheduler` / `FilesPurgeProcessor` (files) | infrastructure | `upsertJobScheduler('files-purge', cron)` и вызов `PurgeExpiredFilesUseCase` |
| `FilesController` (files) | interface/http | `POST /files` (busboy, поток), `GET /files/:id`, `DELETE /files/:id`, `POST /files/:id/download-link`, публичный `GET /files/:id/content` |
| `QueueRootModule` (shared/queue) | infrastructure | `@Global` `BullModule.forRootAsync` с подключением к Redis из env |
| `MeetingTranscriptRepositoryPort` / `MeetingTranscriptRepository` (transcription) | domain port / infrastructure | `insertPendingIfAbsent`, `findByFileId`, `findByFileIdForUpdate` (только в транзакции), `save` |
| `MeetingTranscriberPort` (transcription) | domain port | Провайдер расшифровки с собеседниками |
| `ChunkedMeetingTranscriber` (transcription) | infrastructure | Реализует `MeetingTranscriberPort`: временный файл → `probe` → `planChunks` → для каждого куска по очереди `render` с образцами из `SpeakerRegistry` → провайдер → `ingest` → `TranscriptMerger`. Суммирует `usage` кусков. Отвечает за временную папку |
| `AudioChunkerPort` / `AudioChunker` (transcription, `infrastructure/ffmpeg`) | domain port / infrastructure | `probe` (длительность, `too-long`, `unsupported-media`) и `render`: файл `[образцы через 1 с тишины][кусок]` в mono 16 кГц opus без видео, раскладка префикса. Проверка файла ≤ 20 МБ |
| `ChunkTranscriberPort` / `ChunkTranscriber` (transcription, `infrastructure/openrouter`) | domain port / infrastructure | `POST {OPENROUTER_BASE_URL}/audio/transcriptions`, `elevenlabs/scribe-v2`, base64 ogg, `verbose_json`, `diarize`, zod-разбор слов и `usage: { seconds, cost }`, таймаут 90 с, до 2 повторов куска, коды → временная или постоянная ошибка |
| `planChunks` (transcription) | domain | Границы кусков по длительности, размеру куска и перекрытию |
| `SpeakerRegistry` (transcription) | domain | Глобальные спикеры записи: выбор образцов голоса, сопоставление локальных меток куска по образцам (≥ 60% слов), слияние глобальных при общей метке (union-find), запасной путь по перекрытию, перевод времени в абсолютное |
| `TranscriptMerger` (transcription) | domain | Стык соседних кусков по середине перекрытия, группировка слов в сегменты, нумерация `Спикер N` по первому появлению |
| `MeetingTranscriptionQueuePort` / `MeetingTranscriptionQueue` (transcription) | domain port / infrastructure | `enqueue(fileId, jobId)` в очередь `meeting-transcription`, `findFailedJobFileId(jobId)` для зависшего job'а |
| `StartMeetingTranscriptionOnFileUploaded` (transcription) | application (outbox-подписчик) | Для `recording`: `insertPendingIfAbsent` и `enqueue` с `jobId = fileId` |
| `FailMeetingTranscriptionOnFileDeleted` (transcription) | application (outbox-подписчик, нетранзакционный) | На `file.deleted` для `recording`: `cause = owner` → `failed('file-deleted')`, `cause = retention` → `failed('timeout')` через `FailMeetingTranscriptionUseCase` |
| `TranscribeMeetingUseCase` (transcription) | application | Под `FOR UPDATE` статус `processing`, открыть файл (удалён → `failed('file-deleted')`), вызвать провайдера, под `FOR UPDATE` сохранить результат и событие, только если расшифровка всё ещё в `processing` с этой попыткой, снять удержание. На последней попытке, при постоянной ошибке или дедлайне `failed`. Итоговый лог с суммарными `usage.seconds` и `usage.cost` |
| `FailMeetingTranscriptionUseCase` (transcription) | application | Под `FOR UPDATE` закрывает незавершённую расшифровку `failed(reason)` с событием и снимает удержание; финальную не трогает. Вызывают процессор (окончательный failed, stalled) и подписчик `file.deleted` |
| `GetMeetingTranscriptUseCase` (transcription) | application | Статус и сегменты с проверкой владельца (404) |
| `RetryMeetingTranscriptionUseCase` (transcription) | application | Владелец, статус `failed` (иначе 409), `HoldFile` (410), `retry`, `enqueue` с новым `jobId` |
| `MeetingTranscriptionProcessor` (transcription) | infrastructure | BullMQ worker с `concurrency`. Считает `isFinalAttempt` и дедлайн `MEETING_TRANSCRIPTION_JOB_TIMEOUT_MS`, постоянную ошибку отдаёт как `UnrecoverableError`. На окончательном `failed` и на `stalled` вызывает `FailMeetingTranscriptionUseCase` с `provider-unavailable` |
| `MeetingTranscriptsController` (transcription) | interface/http | `GET /transcripts/:fileId`, `POST /transcripts/:fileId/retry` |
| `attachmentDisposition` (shared/http) | interface | Переезжает из `tasks/interface/http`, `tasks` импортирует его из нового места |

### Method Signatures (ключевые, по каждому сервису)
| Service.Method | Params | Returns | Краткое описание |
|---|---|---|---|
| `StoredFile.upload` | `{ id, ownerId, name: FileName, mediaType: MediaType, sizeBytes, storageKey, now }`, `policy: RetentionPolicy` | `StoredFile` | Новый файл с `Retention` по виду и событием `FileUploaded` |
| `StoredFile.releaseHold` | `now: Date`, `policy` | `void` | `expiresAt = now + recordingDays`, `heldUntil = null`. Повторный вызов ничего не делает |
| `StoredFile.hold` | `now: Date`, `policy` | `void` | `heldUntil = now + maxHoldDays`, `expiresAt = null`. Для `deleted` бросает `FileGoneError` |
| `StoredFile.isExpired` | `now: Date`, `policy` | `boolean` | `expiresAt ≤ now` или зависшее удержание (`heldUntil + recordingDays ≤ now`) |
| `StoredFile.markDeleted` | `now: Date`, `cause: 'owner' \| 'retention'` | `void` | `status = deleted`, `deletedAt = now`, событие `FileDeleted` с `cause`. Идемпотентно |
| `RetentionPolicy.initial` | `kind: FileKind`, `now` | `Retention` | Срок при загрузке |
| `ObjectStoragePort.put` | `stream: Readable`, `{ key, contentType, maxBytes }` | `Promise<{ sizeBytes: number }>` | Бросает `FileTooLargeError`, не оставляя объекта |
| `ObjectStoragePort.get` | `key: string` | `Promise<Readable \| null>` | `null`, если объекта нет |
| `ObjectStoragePort.delete` | `key: string` | `Promise<void>` | Отсутствие объекта — не ошибка |
| `ObjectStoragePort.ensureBucket` | `—` | `Promise<void>` | Создаёт бакет, если его нет. Ошибку `FilesModule` логирует и не пробрасывает |
| `StoredFileRepositoryPort.findByIdForUpdate` | `id: string` | `Promise<StoredFile \| null>` | `SELECT … FOR UPDATE`, только внутри транзакции |
| `MediaTypeDetector.detect` | `head: Buffer`, `fileName: string` | `Promise<MediaType>` | Бросает `UnsupportedMediaTypeError` |
| `UploadFileUseCase.execute` | `{ ownerId, fileName, stream: Readable }` | `Promise<StoredFileView>` | 201 / 400 / 413 / 415 |
| `GetFileUseCase.execute` | `{ ownerId, fileId }` | `Promise<StoredFileView>` | 404 для чужого или несуществующего |
| `DeleteFileUseCase.execute` | `{ ownerId, fileId }` | `Promise<void>` | 204, идемпотентно |
| `CreateDownloadLinkUseCase.execute` | `{ ownerId, fileId }` | `Promise<{ url: string; expiresAt: Date }>` | 404 / 410 / 503 без секрета |
| `DownloadFileContentUseCase.execute` | `{ fileId, token }` | `Promise<{ stream: Readable; name: string; contentType: string; sizeBytes: number }>` | 403 / 410 |
| `PurgeExpiredFilesUseCase.execute` | `now: Date` | `Promise<{ deleted: number; failed: number }>` | Пачками по 100 |
| `OpenFileForProcessingUseCase.execute` | `fileId: string` | `Promise<{ stream: Readable; contentType: string; sizeBytes: number } \| null>` | Без проверки владельца, только для модулей |
| `HoldFileUseCase.execute` | `fileId: string` | `Promise<void>` | `FileGoneError` для удалённого |
| `ReleaseFileHoldUseCase.execute` | `fileId: string` | `Promise<void>` | Идемпотентно, для `document` и удалённого ничего не делает |
| `DownloadTokenPort.sign` | `fileId: string`, `ttlSec: number` | `{ token: string; expiresAt: Date }` | JWT |
| `DownloadTokenPort.verify` | `token: string`, `fileId: string` | `boolean` | `false` для просроченного, чужого или подделанного |
| `MeetingTranscript.start` / `complete` / `fail` / `retry` | `—` / `(t: DiarizedTranscript, now)` / `(reason, now)` / `—` | `void` | Переходы статусов, `complete` с пустыми сегментами даёт `no_speech`. Записывают события |
| `MeetingTranscriberPort.transcribe` | `{ stream: Readable; contentType: string; sizeBytes: number }`, `signal: AbortSignal` | `Promise<{ transcript: DiarizedTranscript; usage: TranscriptionUsage }>` | Бросает `TranscriptionTemporaryError` или `TranscriptionPermanentError(reason)` |
| `AudioChunkerPort.probe` | `inputPath: string`, `signal: AbortSignal` | `Promise<{ durationSec: number }>` | Бросает `TranscriptionPermanentError('too-long' \| 'unsupported-media')` |
| `AudioChunkerPort.render` | `inputPath: string`, `chunk: ChunkPlan`, `exemplars: SpeakerExemplar[]`, `workDir: string`, `signal: AbortSignal` | `Promise<AudioChunk>` | `AudioChunk = { index, path, sizeBytes, startSec, endSec, prefixSec, exemplarLayout: { globalSpeakerId, startInFileSec, endInFileSec }[] }` |
| `planChunks` | `durationSec`, `chunkSec`, `overlapSec` | `ChunkPlan[]` | `ChunkPlan = { index, startSec, endSec }` |
| `SpeakerRegistry.exemplars` | `—` | `SpeakerExemplar[]` | `{ globalSpeakerId, sourceStartSec, durationSec }`, до `MAX_EXEMPLARS` |
| `SpeakerRegistry.ingest` | `chunk: AudioChunk`, `words: ChunkWord[]` | `void` | Сопоставляет метки куска, сохраняет слова с глобальными метками в абсолютном времени |
| `ChunkTranscriberPort.transcribe` | `chunk: AudioChunk`, `signal: AbortSignal` | `Promise<{ language: string \| null; words: ChunkWord[]; usage: TranscriptionUsage \| null }>` | `ChunkWord = { text, start, end, speaker }`, время от начала куска; `usage` — `null`, если провайдер его не вернул |
| `TranscriptMerger.merge` | `registry: SpeakerRegistry`, `{ overlapSec }`, `language`, `durationSec` | `DiarizedTranscript` | Чистая функция, без I/O |
| `MeetingTranscriptionQueuePort.enqueue` | `fileId: string`, `jobId: string` | `Promise<void>` | Дубль по `jobId` молча игнорируется |
| `MeetingTranscriptionQueuePort.findFailedJobFileId` | `jobId: string` | `Promise<string \| null>` | `fileId` job'а, который BullMQ перевёл в failed после `stalled` |
| `MeetingTranscriptRepositoryPort.findByFileIdForUpdate` | `fileId: string` | `Promise<MeetingTranscript \| null>` | `SELECT … FOR UPDATE`, только внутри транзакции |
| `StartMeetingTranscriptionOnFileUploaded.handle` | `event: FileUploaded` | `Promise<void>` | Для `document` ничего не делает |
| `FailMeetingTranscriptionOnFileDeleted.handle` | `event: FileDeleted` | `Promise<void>` | Для `document` ничего не делает; `owner` → `file-deleted`, `retention` → `timeout` |
| `TranscribeMeetingUseCase.execute` | `{ fileId: string; isFinalAttempt: boolean; deadline?: AbortSignal }` | `Promise<void>` | Временная ошибка на непоследней попытке пробрасывается для повтора BullMQ. Если расшифровку закрыли во время работы, результат отбрасывается без ошибки |
| `FailMeetingTranscriptionUseCase.execute` | `{ fileId: string; reason: TranscriptionFailureReason }` | `Promise<void>` | Только из `pending` / `processing`; для финальной или отсутствующей ничего не делает |
| `GetMeetingTranscriptUseCase.execute` | `{ ownerId, fileId }` | `Promise<MeetingTranscriptView>` | 404 |
| `RetryMeetingTranscriptionUseCase.execute` | `{ ownerId, fileId }` | `Promise<void>` | 202 / 404 / 409 / 410 |

---

## Frontend — UI Model

Не применимо: клиенты (Chrome Extension, Electron) в этом изменении не меняются. UI загрузки, карточки файлов и скачивания пойдут отдельным изменением поверх этого API.

### Pages
Нет.

### Features (переиспользуемые модули с бизнес-логикой)
Нет.

### UI-компоненты (page-local и shared)
Нет.

### Hooks (model)
Нет.

### Паттерны, которые нужно учесть при проектировании
Не применимо.

---

## Diagrams

### 1. Domain Entity Interaction
`StoredFile` состоит из `FileName`, `MediaType` и `Retention`, срок считает `RetentionPolicy`. Загрузка порождает `FileUploaded`. Для `recording` это событие создаёт `MeetingTranscript` в статусе `pending`. Удаление файла порождает `FileDeleted`, которое закрывает незавершённую расшифровку. Расшифровка ссылается на файл по `fileId` и переживает его удаление, состоит из `TranscriptSegment`, получает результат из `DiarizedTranscript` и порождает события «завершена» или «не удалась».

Miro link: https://miro.com/app/board/uXjVEP6UhAI=/?moveToWidget=3458764690181308153

### 2. External Modules Interaction
- Клиенты → `files` (загрузка, ссылка) и `transcription` (статус расшифровки).
- `files` → MinIO (потоки) и Postgres (`stored_file` и outbox в одной транзакции).
- outbox → подписчик `transcription` → Redis (BullMQ, `jobId = fileId`).
- Процессор `transcription` → публичные use case'ы `files` (открыть файл, удержание) → `ffmpeg` (временная папка, куски по 10 мин с образцами голоса известных спикеров в начале) → OpenRouter `/audio/transcriptions` (`elevenlabs/scribe-v2`, куски по очереди).
- `files` → BullMQ (ежедневная очистка).
- `shared/queue` — общий корень BullMQ для `audit-agent`, `files` и `transcription`.

Miro link: https://miro.com/app/board/uXjVEP6UhAI=/?moveToWidget=3458764690181308154

### 3. Layer Interaction — от Controller до Response
1. `POST /files` → определение типа (415) → поток в MinIO со счётчиком (413, abort) → транзакция `stored_file` и событие → 201.
2. Outbox → подписчик → `meeting_transcript pending` и job.
3. Процессор → `processing` → файл из MinIO во временную папку → `ffprobe` (`too-long`) → по очереди для каждого куска: образцы из `SpeakerRegistry` → `render` → OpenRouter → `ingest` → `TranscriptMerger` (стыки, сегменты). Дальше ветки: успех (сегменты, `completed`, снятие удержания), временная ошибка (повтор BullMQ), постоянная ошибка или последняя попытка (`failed`, снятие удержания).
4. Ссылка на скачивание → `GET /content?token` → поток.
5. Ежедневная очистка → `delete` в MinIO → `status deleted`, расшифровка остаётся.

Miro link: https://miro.com/app/board/uXjVEP6UhAI=/?moveToWidget=3458764690181308155

---

## Confirmation Checklist
- [x] Названия entity/aggregate/VO согласованы
- [x] Названия и сигнатуры ключевых методов сервисов согласованы
- [x] Слои (pages/features/kernel/shared), структура model/ui и паттерны фронта согласованы (неприменимо: фронт не меняется)
- [x] Диаграммы взаимодействия отражают ожидаемую реализацию
- [x] Пользователь подтвердил переход к tasks.md
