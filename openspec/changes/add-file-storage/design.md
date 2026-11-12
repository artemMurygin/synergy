## Context

Мотивация — в proposal.md, требования — в `specs/file-storage` и `specs/meeting-transcription`.

Что уже есть:
- **Вложения задач** (`tasks`): порт `FileStorage` (`save` / `open` / `delete`) и `LocalDiskFileStorage` в `./storage/tasks`, multer спулит загрузку на диск, имя отдаётся через `attachmentDisposition` (RFC 5987). В `docker-compose` у `app` нет volume под `storage/`.
- **Outbox** (`shared/outbox`): `DomainEventRegistry.register/subscribe`, подписчики с `isTransactional`, доставка хотя бы один раз, порядок в пределах агрегата.
- **BullMQ**: корень `BullModule.forRootAsync` зарегистрирован внутри `audit-agent/infrastructure/queue/queue.module.ts`. Там же есть пример периодической задачи: `upsertJobScheduler` в `DealSyncScheduler`.
- **`transcription`**: модуль создаётся в `add-telegram-voice-task-agent` (ещё не закоммичен). `TranscribeVoiceUseCase` для голосовых до 3 минут через OpenRouter `/chat/completions` (Gemini), без диаризации.
- **Бенчмарк** (`transcription/bench`): из протестированных моделей собеседников разделил только `elevenlabs/scribe-v2` («Спикер 0 / Спикер 1» с таймкодами, $0,0052 за 85 с). `deepgram/nova-3` через OpenRouter разметку не вернул, LLM-модели выдают сплошной текст.
- **Документация OpenRouter STT**: для провайдеров кроме OpenAI и Groq тело запроса ограничено 25 МБ, а апстрим обрывает запрос через 60 с. Часовую встречу одним запросом не расшифровать, документация прямо советует резать длинные записи.
- **Прямой API ElevenLabs недоступен** (решение пользователя). Остаётся `elevenlabs/scribe-v2` через OpenRouter `/audio/transcriptions` с `diarize: true` и `response_format: verbose_json`. По бенчмарку 85 с аудио обрабатываются за 4,8 с (≈ 18× быстрее реального времени), метки спикеров приходят в `words[]` (`speaker` / `speaker_label`, `start`, `end`).
- В Docker-образе бэкенда (`node:26-alpine`) `ffmpeg` нет.
- Сервер бэкенда доступен по `http://<ip>:1234`. Клиенты (Chrome Extension, Electron) ходят к нему с Bearer-токеном.

## Goals / Non-Goals

**Goals:**
- Общее хранилище файлов, которое переживает пересборку контейнера и масштабирование на несколько экземпляров.
- Записи не задерживаются дольше, чем нужно для расшифровки.
- Расшифровка стартует сама и не зависит от HTTP-соединения и рестарта процесса.
- Модуль `files` ничего не знает о расшифровке: связь только через событие и публичный use case снятия удержания.

**Non-Goals:**
- Presigned URL MinIO для клиентов: MinIO наружу не публикуется.
- Загрузка частями (tus, S3 multipart с клиента).
- Идеальная сквозная идентификация собеседников. Сопоставление по перекрытию кусков даёт «лучшее усилие»: если голос не удалось сопоставить, человек получает новую метку (см. спеку «Длинные записи»).
- Перенос `task-attachments` на MinIO. Порт `FileStorage` в `tasks` остаётся как есть, чтобы не трогать модуль, который сейчас меняется параллельно.

## Decisions

### 1. MinIO вместо локального диска
Сервис `minio` в `backend/docker-compose.yml`:
- образ `pgsty/minio` (сборка MinIO из исходников от проекта Pigsty), закреплён по тегу и digest. Официальные `minio/minio` и `quay.io/minio/minio` больше не публикуются (проверено при реализации), выбор согласован с пользователем;
- volume `miniodata`;
- healthcheck `mc ready local`;
- порты API и консоли только на `127.0.0.1`.

Бэкенд при старте проверяет бакет (`HeadBucket`) и создаёт его, если бакета нет (`CreateBucket`). Отдельный init-контейнер с `mc` не нужен. Если MinIO недоступен, ошибка `ensureBucket` пишется в лог и не роняет приложение: остальные модули работают, а запросы к файлам отвечают ошибкой, пока хранилище не починят.

Клиент — `@aws-sdk/client-s3` с `forcePathStyle: true`. Код не привязан к MinIO: тот же адаптер работает с любым S3 (Yandex Object Storage, AWS).

- *Почему не локальный диск:* второй экземпляр бэкенда или отдельный воркер не увидят файл, а volume на одной машине не масштабируется.
- *Почему не Postgres `bytea`:* записи до 1 ГБ раздувают WAL и бэкапы, и место после удаления не возвращается без `VACUUM FULL`.
- *Почему не lifecycle-правила бакета для удаления:* у записей срок плавающий (от конца расшифровки), а метаданные в БД всё равно нужно переводить в `deleted`. Удаление делает наша задача, бакет без lifecycle.

### 2. Модуль `files` и агрегат `StoredFile`
`StoredFile` (корень агрегата):
- `id`, `ownerId`, `name: FileName`, `mediaType: MediaType`, `kind: 'recording' | 'document'`, `sizeBytes`, `storageKey`, `status: 'active' | 'deleted'`;
- `retention: Retention` (`heldUntil | null`, `expiresAt | null`);
- `uploadedAt`, `deletedAt`.

Методы:
- `StoredFile.upload(...)` применяет `RetentionPolicy` и записывает событие `FileUploaded`;
- `releaseHold(now)`, `hold(now)` (для повтора);
- `markDeleted(now, cause)` записывает событие `FileDeleted` (`ownerId`, `kind`, `cause: 'owner' | 'retention'`); повторный вызов ничего не делает;
- `isExpired(now)`.

`RetentionPolicy` — доменный сервис с настройками:
- `document` → `expiresAt = uploadedAt + 30 д`;
- `recording` → `heldUntil = uploadedAt + 7 д`, `expiresAt = null`;
- `releaseHold(now)` → `expiresAt = now + 1 д`, `heldUntil = null`.

Если `heldUntil` прошёл, а удержание не снято, очистка считает срок как `heldUntil + 1 д`. Так в домене не нужен отдельный «таймер удержания».

Порты и адаптеры:
- `ObjectStoragePort` → `ObjectStorage` (`infrastructure/s3`) — `put(stream, { key, contentType, maxBytes })`, `get(key)`, `delete(key)`, `ensureBucket()`;
- `StoredFileRepositoryPort` → `StoredFileRepository` (`infrastructure/persistence`), с `findByIdForUpdate` для чтения под блокировкой;
- `DownloadTokenPort` → `DownloadTokenService` (`infrastructure/jwt`) — `sign(fileId, ttlSec)`, `verify(token, fileId)`;
- `FilesSettingsPort` → `FilesSettings` (лимиты и TTL ссылки), `FilesClockPort` → `SystemFilesClock`.

Все изменения строки файла (`DeleteFile`, `HoldFile`, `ReleaseFileHold`, очистка) идут в транзакции под `SELECT … FOR UPDATE`: параллельные `HoldFile` и `ReleaseFileHold` не «воскресят» удалённый файл, а очистка перечитывает строку перед удалением. Событие `FileDeleted` пишется в outbox в той же транзакции.

Use cases:
- `UploadFile`, `GetFile`, `DeleteFile`, `CreateDownloadLink`, `DownloadFileContent`, `PurgeExpiredFiles`;
- публичные для других модулей: `OpenFileForProcessing` (поток и метаданные по `fileId` без проверки владельца, только для внутренних потребителей) и `HoldFile` / `ReleaseFileHold`.

`FilesModule` экспортирует только эти три use case'а.

- *Почему новый порт, а не перенос `tasks/FileStorage`:* тот порт генерирует ключ сам и не принимает `contentType`, а в S3 тип нужен при `put`. Новый порт живёт в `files`. Позже `tasks` переедет на него отдельным изменением.

### 3. Потоковая загрузка без спула на диск
Контроллер не использует `FileInterceptor`. Тело multipart разбирается `busboy` (он уже стоит транзитивно через multer, добавляем его прямой зависимостью), поток файла идёт сразу в S3 через `@aws-sdk/lib-storage` `Upload` (multipart upload частями по 8 МБ).

Перед отправкой первые 4100 байт буферизуются, `file-type` определяет тип, и по нему выбирается `kind` и лимит. Счётчик байт в `Transform` обрывает поток при превышении лимита. После обрыва вызывается `Upload.abort()`, затем `delete(key)`. Строка в БД и событие пишутся в одной транзакции только после успешного `put`. Если запись в БД упала, объект удаляется (компенсация).

- *Почему не multer `dest`:* запись на 1 ГБ сначала легла бы целиком на диск контейнера, а потом читалась бы второй раз.
- *Текстовые форматы:* у csv и txt нет сигнатуры. Если `file-type` вернул `undefined`, расширение `.csv` или `.txt` допускается, когда буфер декодируется `TextDecoder('utf-8', { fatal: true })`.
- *Office:* `file-type` различает xlsx и docx внутри zip, старые xls и doc определяет как `application/x-cfb`. Для cfb итоговый тип берётся по расширению (`.xls` / `.doc`), иначе 415.

### 4. Скачивание через бэкенд по подписанному токену
`POST /files/:id/download-link` (Bearer) возвращает `{ url: "/files/:id/content?token=…", expiresAt }`.

Токен — JWT через `JwtService` с отдельным секретом `FILES_DOWNLOAD_TOKEN_SECRET`, `aud: 'file-download'`, `sub: fileId`, `exp: 5 мин`. Секрет необязателен: без него приложение стартует, `POST /files/:id/download-link` отвечает `503 FILE_DOWNLOAD_LINKS_UNAVAILABLE`, а любой токен на `GET /content` считается недействительным.

`GET /files/:id/content` помечен как публичный (без auth guard) и проверяет токен и совпадение `sub` с `:id`. Ответ — `StreamableFile` из `get(key)`, `attachmentDisposition(name)` (утилиту переносим в `shared/http`).

- *Почему не presigned URL MinIO:* MinIO пришлось бы публиковать наружу с отдельным доменом и TLS. Позже `DownloadTokenPort` можно заменить на presigned URL без изменения API (ответ всё так же `{ url, expiresAt }`).
- *Почему не просто Bearer на `GET`:* `chrome.downloads.download` и `webContents.downloadURL` не умеют передавать заголовок `Authorization`.

### 5. Общий корень BullMQ
`BullModule.forRootAsync` переносится в `shared/queue/queue-root.module.ts` (`@Global`). `audit-agent` и `files` / `transcription` регистрируют только свои очереди через `registerQueueAsync`. Поведение `audit-agent` не меняется.

### 6. Ежедневная очистка
Очередь `files-maintenance`. `FilesPurgeScheduler.onApplicationBootstrap` вызывает `upsertJobScheduler('files-purge', { pattern: FILES_PURGE_CRON })`, по умолчанию `0 3 * * *` (Europe/Moscow).

Процессор вызывает `PurgeExpiredFiles`:
1. Выбирает пачками по 100 файлы с `status = 'active'` и `(expires_at <= now OR (expires_at IS NULL AND held_until <= now - 1 д))`.
2. Для каждого в транзакции: перечитать строку под `FOR UPDATE` и проверить, что срок всё ещё истёк (владелец мог удалить файл или поставить удержание повтором), затем `delete(key)` (отсутствие объекта не ошибка), `markDeleted(now, 'retention')`, сохранение и событие `FileDeleted`.
3. Ошибка по одному файлу логируется, и очистка идёт дальше.

Один запуск на кластер гарантирует BullMQ (job scheduler — один job на тик).

### 7. Расшифровка встреч: событие → очередь → процессор
- **Подписчик `StartMeetingTranscriptionOnFileUploaded`** (`isTransactional = false`: строка должна закоммититься до `enqueue`, иначе воркер берёт job раньше коммита и не находит расшифровку; найдено на стенде, 23.1):
  - для `kind = 'recording'` вставляет `meeting_transcript(file_id PK, owner_id, status 'pending')` с `ON CONFLICT DO NOTHING`;
  - затем ставит job `transcribe-meeting` с `jobId = fileId` (BullMQ не создаст дубль).

  Если `add` упал, outbox повторит доставку: вставка идемпотентна, job дедуплицируется по `jobId`.
- **Процессор** (очередь `meeting-transcription`, `concurrency` из env, по умолчанию 2) вызывает `TranscribeMeetingUseCase.execute(fileId)`:
  1. В транзакции под `SELECT … FOR UPDATE`: если статус уже финальный, job ничего не делает; иначе `status → processing`, `attempts + 1`.
  2. `OpenFileForProcessing(fileId)`. Если файл удалён, результат `failed('file-deleted')` без повтора, провайдер не вызывается.
  3. `MeetingTranscriberPort.transcribe({ stream, contentType, sizeBytes }, signal)` → `{ transcript: DiarizedTranscript, usage }`. Нарезка, вызовы провайдера и склейка скрыты за портом (решение 8).
  4. В транзакции под `FOR UPDATE`: только если расшифровка всё ещё в `processing` с номером попытки этого job'а, сохранить сегменты, `status = completed | no_speech`, событие `MeetingTranscriptCompleted`. Иначе её уже закрыли (подписчик `file.deleted`, обработчик упавшего job'а) или запустили повтор: результат отбрасывается без сохранения и второго события.
  5. Вызвать `ReleaseFileHold(fileId)`. Итоговый лог: длительность, число спикеров, попытки, исход и суммарные `usage.seconds` и `usage.cost`, без текста.
- **Повторы**: job `attempts` из env (по умолчанию 3), backoff exponential 30 с. `TranscriptionPermanentError` (провайдер ответил 400 или 422 «неподдерживаемый файл») пробрасывается как `UnrecoverableError` BullMQ.

  На последней неудачной попытке (`job.attemptsMade + 1 >= attempts`) или при постоянной ошибке use case в транзакции ставит `failed(reason)`, пишет событие `MeetingTranscriptFailed` и снимает удержание. Переход идёт по тем же правилам, что и шаг 4. Решение «последняя попытка или нет» use case получает параметром `isFinalAttempt`, чтобы не зависеть от BullMQ.
- **Дедлайн job'а** `MEETING_TRANSCRIPTION_JOB_TIMEOUT_MS` (по умолчанию 2 ч): `AbortSignal` прерывает `ffmpeg`, `ffprobe` и запросы к провайдеру, расшифровка сразу получает `failed('timeout')` без повторов.
- **Сбой вне use case** (`FailMeetingTranscriptionUseCase`): процессор вызывает его на окончательно упавшем job'е (событие `failed` с `finishedOn`) и на job'е, который BullMQ перевёл в failed после `maxStalledCount` (событие `stalled`, `fileId` берётся из упавшего job'а). Незавершённая расшифровка получает `failed('provider-unavailable')`, удержание снимается. Use case читает расшифровку под `FOR UPDATE` в транзакции и ничего не делает с финальной.
- **Подписчик `FailMeetingTranscriptionOnFileDeleted`** (`isTransactional = false`) на `file.deleted` для `recording` закрывает незавершённую расшифровку через `FailMeetingTranscriptionUseCase`: `cause = owner` → `failed('file-deleted')`, `cause = retention` → `failed('timeout')` (очистка удаляет незавершённую запись только по максимуму удержания). Без него расшифровка осталась бы в `pending` навсегда, а повтор отвечал бы 409 вместо 410.
- **Повтор по запросу** (`RetryMeetingTranscription`): проверить владельца и статус `failed`, затем `HoldFile(fileId)` (410, если файл удалён), `status → pending`, новый job с `jobId = ${fileId}:${attempts}`.

- *Почему BullMQ, а не прямо в подписчике outbox:* расшифровка часа идёт минутами. Подписчик держал бы доставку и очередь агрегата, а таймаут и параллелизм outbox под это не настроены. BullMQ уже есть, переживает рестарт и даёт `concurrency`.
- *Почему не `ChatWorkQueue` в памяти:* он теряет задачу при рестарте, а для записи на час это недопустимо.
- *Почему блокировка строки, а не слепой upsert:* подписчик `file.deleted` и job закрывают расшифровку независимо. Без `FOR UPDATE` job мог перезаписать `failed` на `completed` или поставить `failed` второй раз, и клиент получил бы два финальных события.

### 8. Провайдер: `elevenlabs/scribe-v2` через OpenRouter, нарезка `ffmpeg` и образцы голоса
`MeetingTranscriberPort` реализует `ChunkedMeetingTranscriber`. Куски обрабатываются **последовательно**: каждый следующий получает в начало короткие образцы голоса уже известных спикеров, и модель сама сопоставляет людей между кусками (итоги спайка ниже).

**1. План кусков** — чистая функция `planChunks(durationSec, chunkSec, overlapSec)`: куски по `MEETING_TRANSCRIPTION_CHUNK_SEC` (600 с) с перекрытием `MEETING_TRANSCRIPTION_CHUNK_OVERLAP_SEC` (30 с). Последний кусок может быть короче. Запись короче одного куска — один кусок.

**2. `AudioChunkerPort` → `AudioChunker`** (`infrastructure/ffmpeg`) (`ffmpeg`/`ffprobe` через `child_process.spawn`, без обёрток):
- `probe(inputPath)`. Поток из MinIO заранее пишется во временную папку (`mkdtemp` в `os.tmpdir()`). Читать прямо из потока нельзя: у mp4 и m4a индекс `moov` часто лежит в конце файла. `ffprobe` даёт длительность. Если записи нет или она длиннее `MEETING_TRANSCRIPTION_MAX_DURATION_SEC` (4 ч), бросается `TranscriptionPermanentError('too-long')`. Если файл не декодируется — `unsupported-media`.
- `render(inputPath, chunk, exemplars, workDir)` собирает один ogg-файл: `[образец 1][1 с тишины][образец 2][1 с тишины]…[кусок записи]`. Каждый образец и кусок вырезается `-ss/-t` из исходного файла, склейка — фильтр `concat`. Видео отбрасывается, звук приводится к `-ac 1 -ar 16000 -c:a libopus -b:a 32k`. Возвращается путь, размер и раскладка префикса: `prefixSec` и для каждого образца его интервал внутри файла. Кусок в 10 минут плюс 8 образцов весит около 2,7 МБ. Если файл больше `MEETING_TRANSCRIPTION_MAX_CHUNK_BYTES` (20 МБ), это ошибка конфигурации и постоянная ошибка.
- Временная папка удаляется в `finally` оркестратора всегда.

**3. `ChunkTranscriberPort` → `ChunkTranscriber`** (`infrastructure/openrouter`):
- запрос: `POST {OPENROUTER_BASE_URL}/audio/transcriptions`, JSON `model: elevenlabs/scribe-v2` (`MEETING_TRANSCRIPTION_MODEL`), `input_audio: { data: base64, format: 'ogg' }`, `response_format: 'verbose_json'`, `timestamp_granularities: ['word']`, `diarize: true`, `language` из `MEETING_TRANSCRIPTION_LANGUAGE` (пусто — автоопределение);
- ответ по спайку: `words[]` с полями `word`, `start`, `end`, `speaker` (число), `speaker_label`, `confidence`. Метка берётся из `speaker`, при отсутствии — из `speaker_label`. Пустые слова и пробелы отбрасываются;
- таймаут на кусок `MEETING_TRANSCRIPTION_CHUNK_TIMEOUT_MS` (90 с). По спайку кусок обрабатывается за 17–23 с;
- коды ответа: 429, 5xx и таймаут — временная ошибка; 400, 413 и 422 — постоянная; 401 и 403 — временная с громким логом. Внутри запуска кусок повторяется до 2 раз;
- `usage: { seconds, cost }` из ответа возвращается вместе со словами (`null`, если поля нет). `ChunkedMeetingTranscriber` суммирует его по кускам, а `TranscribeMeetingUseCase` пишет итог в лог.

**4. `SpeakerRegistry`** (чистый доменный класс, без I/O) ведёт глобальных спикеров записи:
- `exemplars()` — до `MEETING_TRANSCRIPTION_MAX_EXEMPLARS` (8) образцов, по одному на глобального спикера, самые разговорчивые первыми. Образец — лучший «чистый» отрезок спикера из уже обработанных кусков: самая длинная непрерывная серия его слов (паузы между словами < 1 с) не короче `MIN_EXEMPLAR_SEC` (4 с). Из неё берётся не больше `MEETING_TRANSCRIPTION_EXEMPLAR_SEC` (10 с) от середины. Время образца — абсолютное, в исходной записи.
- `ingest(chunk, words, prefixLayout)` сопоставляет локальные метки куска с глобальными спикерами:
  1. **Образцы.** Для каждого образца берутся слова внутри его интервала в префиксе. Локальная метка, у которой ≥ 60% этих слов (и не меньше 3 слов), получает глобального спикера образца. Если двум образцам досталась одна локальная метка, модель считает их одним человеком, и два глобальных спикера сливаются (union-find, слово «Спикер N» остаётся за тем, кто появился раньше).
  2. **Перекрытие** (запасной путь для меток без образца, например у спикера, который впервые заговорил в конце прошлого куска): слова зоны перекрытия выравниваются с предыдущим куском (`|Δstart| ≤ 0,5 с` и одинаковый нормализованный текст), метке назначается глобальный спикер с наибольшим числом совпадений, если их ≥ `MIN_SPEAKER_MATCH_WORDS` (3) и он ещё не занят.
  3. Иначе — новый глобальный спикер.

  Слова префикса отбрасываются, время остальных переводится в абсолютное: `+ chunk.startSec − prefixSec`.

**5. `TranscriptMerger`** (чистая функция): берёт слова всех кусков с глобальными метками.
- Стык соседних кусков проходит по середине перекрытия: из левого куска слова до середины, из правого — после. Так фраза на стыке не дублируется и не теряется.
- Слова группируются в сегменты по смене спикера.
- Метки нумеруются по первому появлению: `Спикер 1`, `Спикер 2`, …
- Пустой итог даёт `no_speech`.

**Итоги спайка 1.2** (реальная встреча, WAV 203 МБ, 53 мин, 16 кГц стерео):
- **Время и размер.** Куски по 10 мин (opus 32 кбит/с, около 2,2 МБ) обрабатываются за 20–23 с, кусок на 5 мин — за 17 с. Запас до 60 с апстрима большой, поэтому `CHUNK_SEC = 600`.
- **Стоимость.** $0,0367 за 10 мин, то есть около $0,22 за час, плюс примерно 3–4% за образцы и перекрытие.
- **Формат ответа.** `language: "rus"`, `segments` — один блок без спикеров, метки только в `words`.
- **Только перекрытие не годится.** Из 63 слов перекрытия 53 совпали по времени и тексту, и метка 0 второго куска уверенно склеилась с меткой 0 первого. Но в 30 с перекрытия говорил только один человек, и остальные спикеры второго куска остались бы новыми метками. На 6 кусках это дало бы десяток лишних «спикеров».
- **С образцами работает.** Префикс из двух образцов по 10 с (спикеры 0 и 1 первого куска) получил разные метки 0 и 1. Основная часть второго куска дала метке 0 877 слов, метке 1 — 291. Значит, модель узнала тех же людей по голосу. Для метки 0 это совпало с результатом перекрытия. Метку 1 перекрытие сопоставить не могло, образцы — смогли.
- **Нестабильность числа спикеров.** На одном и том же начале записи модель находит 3 спикера в 10-минутном куске и 4 в 5-минутном. Слияние глобальных спикеров (пункт 4.1) частично это гасит.

Решения:
- *Почему по длительности, а не только по 20 МБ:* в сжатом opus 20 МБ — это больше часа звука, такой запрос не уложится в 60 с апстрима.
- *Почему образцы голоса, а не только перекрытие:* перекрытие ловит лишь тех, кто говорил на стыке (см. спайк). Образцы дают модели услышать каждого известного спикера. Перекрытие оставлено для стыка текста и как запасной путь.
- *Почему последовательно, а не параллельно:* куску нужны образцы из предыдущих. Для часа это 6 запросов по ~20 с, около 2 минут. Это приемлемо для фоновой задачи.
- *Почему без LLM и без голосовых эмбеддингов:* образцы используют ту же модель диаризации, ничего нового не нужно. Логика сопоставления детерминирована и тестируется на фикстурах.
- *Короткие голосовые Telegram* остаются в `TranscribeVoiceUseCase` (Gemini через `/chat/completions`), этот путь их не трогает.

### 9. Хранение расшифровки
Таблица `meeting_transcript`:
- `file_id UUID PK REFERENCES stored_file(id)` (без `ON DELETE CASCADE`: строка файла никогда не удаляется физически);
- `owner_id`, `status`, `failure_reason` (CHECK: `provider-unavailable`, `unsupported-media`, `too-long`, `timeout`, `file-deleted`), `language`, `duration_sec`, `speaker_count`;
- `segments JSONB` (`[{ speaker, start, end, text }]`);
- `attempts`, `created_at`, `completed_at`.

JSONB выбран потому, что сегменты читаются только целиком и только вместе с расшифровкой.

### 10. Конфигурация
Все значения в `env.schema.ts` со значениями по умолчанию:
- `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`;
- `FILES_MAX_RECORDING_MB=1024`, `FILES_MAX_DOCUMENT_MB=50`, `FILES_DOCUMENT_RETENTION_DAYS=30`, `FILES_RECORDING_RETENTION_DAYS=1`, `FILES_MAX_HOLD_DAYS=7`, `FILES_PURGE_CRON`, `FILES_DOWNLOAD_TOKEN_SECRET` (необязателен, без него ссылки отвечают 503), `FILES_DOWNLOAD_LINK_TTL_SEC=300`;
- `MEETING_TRANSCRIPTION_MODEL=elevenlabs/scribe-v2`, `MEETING_TRANSCRIPTION_LANGUAGE=`, `MEETING_TRANSCRIPTION_MAX_DURATION_SEC=14400`, `MEETING_TRANSCRIPTION_CHUNK_SEC=600`, `MEETING_TRANSCRIPTION_CHUNK_OVERLAP_SEC=30`, `MEETING_TRANSCRIPTION_MAX_CHUNK_BYTES=20971520`, `MEETING_TRANSCRIPTION_CHUNK_TIMEOUT_MS=90000`, `MEETING_TRANSCRIPTION_MAX_EXEMPLARS=8`, `MEETING_TRANSCRIPTION_EXEMPLAR_SEC=10` (переменная `MEETING_TRANSCRIPTION_CHUNK_CONCURRENCY` не нужна: куски идут последовательно), `MEETING_TRANSCRIPTION_ATTEMPTS=3`, `MEETING_TRANSCRIPTION_CONCURRENCY=2`, `MEETING_TRANSCRIPTION_JOB_TIMEOUT_MS=7200000`;
- ключ и адрес уже есть: `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`.

## Итоги проверки на стенде

Стенд: `docker compose up -d --build` (app на `node:26-alpine` с `ffmpeg`, Postgres, Redis, MinIO), 2026-11-11, вызовы через curl с Bearer-токеном тестового пользователя.

**23.1. Загрузка, расшифровка, ссылка, удаление.**
- xlsx: `201`, `kind: document`, `expiresAt` = загрузка + 30 дней.
- Запись: WAV 230 МБ, 60:00, mono 32 кГц `pcm_s16le` (образец `bench/voice-492965.ogg` с двумя собеседниками, зациклен ffmpeg до часа). `POST /files` — `201` за 2,5 с (поток сразу в MinIO), `kind: recording`, `awaitingProcessing: true`, `expiresAt: null`.
- **Найден и исправлен дефект.** Первая загрузка зависла в `pending`: подписчик `StartMeetingTranscriptionOnFileUploaded` был транзакционным, job попадал в Redis до коммита строки `meeting_transcript`, воркер через 20 мс не находил расшифровку (`Meeting transcript not found`, `outcome: skipped`) и завершал job. Подписчик сделан нетранзакционным (решение 7): вставка коммитится до `enqueue`, повторная доставка по-прежнему безопасна. Тест на флаг обновлён.
- После исправления: `pending → processing → completed` за **149 с** (`elapsedMs: 148960`, 1 попытка; 7 кусков по 10 мин последовательно, около 21 с на кусок), то есть примерно в 24 раза быстрее реального времени. `durationSec: 3600`, `language: rus`, `speakerCount: 2`, 410 сегментов от 1,3 с до 3599,98 с, время монотонно, самая длинная пауза между сегментами 21 с. Метки сквозные: во всех кусках те же «Спикер 1» и «Спикер 2», лишних спикеров на стыках не появилось.
- Качество на синтетике: в нескольких местах модель вернула редкие слова на длинном интервале (например, 1727–1813 с — 8 слов, 2207–2272 с — 5 слов). Всего около 92% слов от ожидаемого по повторам образца. Похоже на особенность модели на зацикленном одинаковом фрагменте; на реальной встрече (спайк 1.2) этого не было. Стоит перепроверить на реальной записи с 3+ участниками (открытый вопрос ниже).
- После `completed` удержание снято: `awaitingProcessing: false`, `expiresAt` = конец расшифровки + 1 день.
- **Стоимость.** Короткая запись 84,5 с — $0,0052 (по разнице `usage` ключа OpenRouter, совпадает с бенчмарком). Провайдер возвращает `usage: { seconds, cost }` в каждом ответе (в фикстуре спайка $0,01833 за 300 с), но на стенде адаптер его ещё не логировал (теперь итог пишется в лог, решение 8), а счётчик ключа обновляется с задержкой. Поэтому стоимость часа посчитана по этой ставке (≈ $0,061 за минуту): 3600 с записи + 150 с перекрытий + около 130 с образцов голоса ≈ **$0,24 за час**.
- Ссылка на скачивание: `POST /files/:id/download-link` → `{ url, expiresAt }`, `exp − iat = 300 с`. `GET` по ссылке без `Authorization` — `200`, байты совпадают с исходным файлом, `Content-Disposition: attachment` с исходным именем, `X-Content-Type-Options: nosniff`. Та же ссылка через 5 мин 10 с — `403 FILE_DOWNLOAD_TOKEN_INVALID` (файл при этом активен).
- Удаление: `DELETE /files/:id` — `204` (повторно тоже `204`), `GET /files/:id` — `status: deleted`, `deletedAt`; новая ссылка — `410 FILE_GONE`; `GET /transcripts/:id` — `completed` с сегментами.

**23.2. Очистка.** Сроки в `.env` целые в днях (минимум 1), поэтому вместо правки `.env` сроки сдвинуты прямо в БД: `expires_at` документа и записи — в прошлое, `held_until` зависшей записи — на 25 ч назад. Job `purge-expired-files` поставлен в очередь `files-maintenance` вручную (скрипт с `bullmq`): `{ deleted: 3, failed: 0 }`, лог `Expired files purged: 3 deleted, 0 failed`. Объекты пропали из MinIO (`mc ls` пуст), строки в статусе `deleted` с `deleted_at`, расшифровка часовой записи доступна (`completed`, 410 сегментов). Зависшая запись (удержание прошло больше суток назад) тоже удалена, её расшифровка осталась в `pending`. `.env` не менялся.

## Risks / Trade-offs

- [Кусок в 10 минут не уложится в 60 с апстрима] → по спайку 20–23 с, запас почти тройной. Если провайдер замедлится, уменьшить `MEETING_TRANSCRIPTION_CHUNK_SEC` настройкой.
- [Сопоставление спикеров ошибается: модель отнесла образец не к тому человеку или слила двух похожих по голосу] → порог 60% слов образца, слияние только когда два образца получили одну метку, запасной путь по перекрытию, новая метка в остальных случаях. Тесты `SpeakerRegistry` на обезличенных фикстурах из спайка. Если на стенде качество окажется плохим, параметры меняются настройкой.
- [Временные файлы: запись до 1 ГБ плюс куски на диске контейнера] → `mkdtemp` и удаление в `finally`, `concurrency` воркера 2. В README указать требование к свободному месту (около 2 × максимальный размер × `concurrency`).
- [`ffmpeg` отсутствует в образе] → `apk add --no-cache ffmpeg` в `Dockerfile.dev` (и в прод-образе, когда он появится). При старте модуля `ffmpeg -version`: если команды нет, ошибка в лог, и задачи получают `failed('provider-unavailable')`.
- [Reverse proxy перед бэкендом режет тело запроса (у nginx по умолчанию 1 МБ)] → в README модуля указать `client_max_body_size` и таймауты. Для dev-сервера на `:1234` проверить вручную.
- [Загрузка на 1 ГБ через Node держит соединение долго] → поток без буферизации, память ограничена размером части `lib-storage` (8 МБ × 4 параллельно).
- [Запись в БД упала после успешного `put`, и компенсация тоже упала] → объект-сирота в бакете. Принимаем: редкий случай. Сироты можно убирать сверкой бакета с БД позже.
- [`ReleaseFileHold` упал после сохранения расшифровки] → запись удалится по максимуму удержания (7 дней + 1). Расшифровка не теряется, теряется только экономия места.
- [Подписчик `file.deleted` и job одновременно закрывают расшифровку] → финальный переход только из незавершённого статуса, под `SELECT … FOR UPDATE` в транзакции; job дополнительно сверяет номер попытки. Проигравший ничего не сохраняет и не публикует.
- [Владелец удалил запись во время расшифровки] → `failed('file-deleted')`. Уже идущий job дорабатывает до конца (куски, отправленные провайдеру, оплачены), его результат отбрасывается.
- [Воркер упал, job завис] → BullMQ переводит его в failed после `maxStalledCount`, процессор по событию `stalled` закрывает расшифровку через `FailMeetingTranscriptionUseCase`.
- [MinIO недоступен при старте] → `ensureBucket` пишет ошибку в лог, приложение работает, файловые запросы отвечают ошибкой до починки.
- [Не задан `FILES_DOWNLOAD_TOKEN_SECRET`] → приложение стартует, выдача ссылок отвечает 503 `FILE_DOWNLOAD_LINKS_UNAVAILABLE`.
- [Публичный эндпоинт `GET /files/:id/content`] → защищён коротким JWT с отдельным секретом и `aud`, токен привязан к `fileId`. В лог токен не пишется (`pino` redact для query `token`).
- [Записи с голосами сотрудников уходят в ElevenLabs через OpenRouter] → в README модуля зафиксировать, куда уходят данные. Настройки приватности OpenRouter (запрет логирования промптов) проверяются в спайке.
- [Параллельная работа над `transcription`] → задача 1.1 проверяет, что `add-telegram-voice-task-agent` закоммичен. Новые файлы лежат в отдельных папках модуля (`meeting/`), `TranscribeVoiceUseCase` не трогаем.

## Migration Plan

1. Развернуть: в `.env` добавить `S3_*` и `FILES_DOWNLOAD_TOKEN_SECRET` (без него ссылки на скачивание отвечают 503), пересобрать образ бэкенда (появится `ffmpeg`), затем `docker compose up -d minio` и перезапустить бэкенд. Миграции 020 и 021 применяются при старте, бакет создаётся сам.
2. Данных для переноса нет: новые таблицы, вложения задач остаются на диске.
3. Откат: выключить эндпоинты откатом версии бэкенда. Таблицы и бакет можно оставить, они ни на что не влияют.

## Open Questions

- Качество сопоставления спикеров на записях с 5+ участниками. Проверяется на стенде (23.1), а параметры (`MAX_EXEMPLARS`, `EXEMPLAR_SEC`, порог 60%) меняются настройкой без изменения спек.
