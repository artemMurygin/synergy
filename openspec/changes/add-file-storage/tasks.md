## 1. Подготовка и спайки

- [x] 1.1 Убедиться, что модуль `transcription` из `add-telegram-voice-task-agent` закоммичен (`git log -- backend/src/modules/transcription` не пуст, `git status` не показывает его как `??`). Если нет — остановиться и согласовать порядок с пользователем (проверено: коммиты 9b9dcad и d11137b, change add-telegram-voice-task-agent заархивирован)
- [x] 1.2 Спайк расшифровки кусками:
  - взять реальную встречу не короче 30 минут, где говорят минимум двое;
  - нарезать `ffmpeg` на куски по 5 и по 10 минут (`-vn -ac 1 -ar 16000 -c:a libopus -b:a 32k`) с перекрытием 30 с;
  - отправить куски в `elevenlabs/scribe-v2` через OpenRouter `/audio/transcriptions` (`input_audio` base64 ogg, `response_format: verbose_json`, `timestamp_granularities: ['word']`, `diarize: true`).

  Зафиксировать в design.md: время ответа и размер куска, укладывается ли кусок в 60 с, имя поля метки спикера в `words` (`speaker` или `speaker_label`), формат времени, язык. Выбрать `MEETING_TRANSCRIPTION_CHUNK_SEC`. Сырые ответы сохранить только локально в `transcription/bench/results` (в git не попадают). Проверка — раздел «Итоги спайка 1.2» в design.md
- [x] 1.3 По ответам из 1.2 собрать обезличенные фикстуры для тестов: `transcription/meeting/testing/fixtures/*.json` — слова с заменённым текстом, но с реальной структурой времени и меток, включая перекрытие двух кусков с общими словами, перекрытие на паузе (без слов) и кусок с префиксом из двух образцов (`scribe-*.json`). Проверка — фикстуры читаются zod-схемой ответа провайдера из задачи 17.1

## 2. Инфраструктура и конфигурация

- [x] 2.1 Добавить сервис `minio` в `backend/docker-compose.yml`: образ с фиксированной версией, volume `miniodata`, healthcheck `mc ready local`, порты API и консоли только на `127.0.0.1`, переменные `MINIO_ROOT_USER` и `MINIO_ROOT_PASSWORD`. Добавить `S3_*` в `environment` сервиса `app`. Проверка — `docker compose up -d minio` и `docker compose ps` показывает `healthy` (образ заменён на pgsty/minio: официальные образы MinIO больше не публикуются; minio healthy)
- [x] 2.2 Добавить `apk add --no-cache ffmpeg` в `backend/Dockerfile.dev`. Проверка — `docker compose run --rm app ffmpeg -version` и `ffprobe -version` печатают версии (проверено: ffmpeg и ffprobe 8.1.3 в контейнере app)
- [x] 2.3 Добавить зависимости `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`, `file-type`, `busboy` (и `@types/busboy` в dev). Проверка — `npm ci` и `npm run typecheck` проходят
- [x] 2.4 Написать тесты на `env.schema.ts`: значения по умолчанию для `S3_*`, `FILES_*` и `MEETING_TRANSCRIPTION_*` из design.md (решение 10), отказ при `FILES_DOWNLOAD_TOKEN_SECRET` короче 32 символов. Убедиться, что vitest их видит
- [x] 2.5 Прогнать тесты из 2.4 и зафиксировать, что они падают (red): новых переменных в схеме ещё нет
- [x] 2.6 Добавить переменные в `env.schema.ts` и `.env.example`
- [x] 2.7 Прогнать тесты из 2.4 и зафиксировать, что они зелёные (green), регрессий в тестах конфигурации нет

## 3. Общий корень BullMQ (`shared/queue`)

- [x] 3.1 Написать тест на `QueueRootModule`: модуль глобальный, `BullModule.forRootAsync` берёт `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` из конфигурации; модуль `audit-agent` собирается без собственного `forRootAsync`. Убедиться, что vitest его видит
- [x] 3.2 Прогнать тест из 3.1 и зафиксировать, что он падает (red): модуля ещё нет
- [x] 3.3 Создать `shared/queue/queue-root.module.ts`, перенести туда `forRootAsync` из `audit-agent/infrastructure/queue/queue.module.ts`, подключить `QueueRootModule` в `app.module.ts`
- [x] 3.4 Прогнать тест из 3.1 и все тесты `audit-agent`, зафиксировать, что они зелёные (green); `npm run typecheck` без ошибок

## 4. Перенос `attachmentDisposition` в `shared/http`

- [x] 4.1 Перенести `content-disposition.ts` и его тесты из `tasks/interface/http` в `shared/http`, обновить импорт в `TaskAttachmentsController`. Чистое перемещение без изменения поведения, поэтому новых тестов нет: проверкой служат перенесённые тесты. Проверка — тесты `content-disposition` и `task-attachments.controller` зелёные

## 5. `files`: домен (`StoredFile`, VO, `RetentionPolicy`)

- [x] 5.1 Написать тесты по спеке `file-storage` и таблицам architecture.md:
  - `FileName`: обрезка, запрет пустого имени и разделителей пути, кириллица;
  - `MediaType`: `kind` по `mime`, отказ для типа вне белого списка;
  - `RetentionPolicy.initial`: документ — `+30 д`, запись — удержание `+7 д` без `expiresAt`;
  - `StoredFile`:
    - `upload` записывает `FileUploaded` без имени файла;
    - `releaseHold` даёт `expiresAt = now + 1 д` и при повторе ничего не меняет;
    - `hold` после `releaseHold` снова ставит удержание;
    - `hold` удалённого бросает `FileGoneError`;
    - `isExpired`: обычный срок и зависшее удержание (`heldUntil + 1 д`);
    - `markDeleted` идемпотентен.

  Убедиться, что vitest их видит
- [x] 5.2 Прогнать тесты из 5.1 и зафиксировать, что они падают (red): доменных классов ещё нет
- [x] 5.3 Реализовать `FileName`, `MediaType`, `FileKind`, `Retention`, `RetentionPolicy`, `StoredFile`, событие `FileUploaded` и доменные ошибки в `modules/files/domain`
- [x] 5.4 Прогнать тесты из 5.1 и зафиксировать, что они зелёные (green), регрессий нет

## 6. `files`: миграция и репозиторий

- [x] 6.1 Написать интеграционные тесты (по образцу `postgres-tasks.repositories.spec.ts`, пропуск без `PROGRAMS_ETL_TEST_ADMIN_URL`):
  - миграция `020_files.sql` создаёт `stored_file` с `CHECK` на `kind` и `status` и индекс для выборки просроченных;
  - `SlonikStoredFileRepository`: сохранение и чтение с восстановлением `Retention`;
  - выборка просроченных: `expires_at <= now` и зависшее удержание, без удалённых, с лимитом пачки;
  - запись файла и событие `file.uploaded` в одной транзакции и откат обоих.

  Убедиться, что vitest их видит
- [x] 6.2 Прогнать тесты из 6.1 с тестовой БД и зафиксировать, что они падают (red): миграции и репозитория ещё нет (red зафиксирован без БД (тесты пропускались, Docker был выключен); против реальной БД прогнан только green)
- [x] 6.3 Написать `db/migrations/020_files.sql`, реализовать `SlonikStoredFileRepository` и регистрацию события `file.uploaded` (`EventRegistration` с zod-схемой) в `DomainEventRegistry`
- [x] 6.4 Прогнать тесты из 6.1 и зафиксировать, что они зелёные (green); существующие миграционные тесты не сломались (green против compose-Postgres подтверждён полным прогоном)

## 7. `files`: определение типа (`MediaTypeDetector`)

- [x] 7.1 Написать тесты на `MediaTypeDetector.detect` с реальными маленькими образцами (собираются в тесте или лежат в `testing/samples`):
  - распознаются xlsx, docx, pdf, mp3, ogg, wav, m4a, mp4;
  - csv и txt в UTF-8 принимаются по расширению, а в cp1251 или с бинарными байтами — 415;
  - cfb принимается с `.xls` и `.doc`, а без такого расширения — 415;
  - исполняемый файл с расширением `.xlsx` — 415.

  Убедиться, что vitest их видит
- [x] 7.2 Прогнать тесты из 7.1 и зафиксировать, что они падают (red): детектора ещё нет
- [x] 7.3 Реализовать `MediaTypeDetector` на `file-type` и белом списке из спеки
- [x] 7.4 Прогнать тесты из 7.1 и зафиксировать, что они зелёные (green), регрессий нет

## 8. `files`: хранилище S3 (`S3ObjectStorage`)

- [x] 8.1 Написать интеграционные тесты на `S3ObjectStorage` против MinIO из compose (пропуск без `FILES_TEST_S3_ENDPOINT`):
  - `ensureBucket` создаёт бакет и повторно не падает;
  - `put` потоком 30 МБ возвращает размер, `get` отдаёт те же байты;
  - `put` сверх `maxBytes` бросает `FileTooLargeError`, и объекта нет;
  - `get` несуществующего возвращает `null`;
  - `delete` несуществующего не бросает ошибку.

  Убедиться, что vitest их видит
- [x] 8.2 Прогнать тесты из 8.1 с поднятым MinIO и зафиксировать, что они падают (red): адаптера ещё нет (red зафиксирован без MinIO (тесты пропускались, Docker был выключен); против MinIO прогнан только green)
- [x] 8.3 Реализовать `ObjectStoragePort` и `S3ObjectStorage` (`client-s3` + `lib-storage` `Upload`, `forcePathStyle`, `Transform`-счётчик, `abort` и `delete` при обрыве)
- [x] 8.4 Прогнать тесты из 8.1 и зафиксировать, что они зелёные (green) (green против MinIO подтверждён полным прогоном)

## 9. `files`: токен скачивания (`JwtDownloadTokenService`)

- [x] 9.1 Написать тесты:
  - `sign` и `verify` для того же `fileId` — `true`;
  - токен файла A для файла B — `false`;
  - просроченный токен (подменённые часы) — `false`;
  - токен с основным `JWT_SECRET` или другим `aud` — `false`;
  - `expiresAt = now + TTL`.

  Убедиться, что vitest их видит
- [x] 9.2 Прогнать тесты из 9.1 и зафиксировать, что они падают (red)
- [x] 9.3 Реализовать `DownloadTokenPort` и `JwtDownloadTokenService` (отдельный `JwtService` с `FILES_DOWNLOAD_TOKEN_SECRET`, `aud: file-download`, `sub: fileId`)
- [x] 9.4 Прогнать тесты из 9.1 и зафиксировать, что они зелёные (green)

## 10. `files`: use case'ы загрузки, метаданных, удаления и скачивания

- [x] 10.1 Написать тесты с фейками (`InMemoryObjectStorage`, `InMemoryStoredFileRepository`, `InMemoryTransactionRunner`, фейковый детектор и часы) по спеке `file-storage`:
  - **`UploadFileUseCase`**:
    - документ — 30 дней, запись — признак ожидания;
    - лимит по виду: 413 без объекта в хранилище;
    - 415 до записи в хранилище;
    - пустой поток — 400;
    - сбой транзакции удаляет объект (компенсация);
    - событие `FileUploaded` опубликовано в той же транзакции.
  - **`GetFileUseCase`**: чужой и несуществующий файл дают одинаковый 404, удалённый — `deleted` с временем удаления.
  - **`DeleteFileUseCase`**: удаляет объект и метит строку, повтор — тот же успех.
  - **`CreateDownloadLinkUseCase`**: 404 для чужого, 410 для удалённого, `url` и `expiresAt`.
  - **`DownloadFileContentUseCase`**: 403 для плохого токена, 410 для удалённого, поток, имя и тип.

  Убедиться, что vitest их видит
- [x] 10.2 Прогнать тесты из 10.1 и зафиксировать, что они падают (red)
- [x] 10.3 Реализовать use case'ы и тестовые двойники в `modules/files/application`
- [x] 10.4 Прогнать тесты из 10.1 и зафиксировать, что они зелёные (green), регрессий нет

## 11. `files`: удержание и открытие файла для модулей

- [x] 11.1 Написать тесты:
  - `HoldFileUseCase`: удержание снова ставится, для удалённого — `FileGoneError`;
  - `ReleaseFileHoldUseCase`: идемпотентен, для документа и удалённого ничего не делает;
  - `OpenFileForProcessingUseCase`: поток и метаданные без проверки владельца, `null` для удалённого и для отсутствующего объекта.

  Убедиться, что vitest их видит
- [x] 11.2 Прогнать тесты из 11.1 и зафиксировать, что они падают (red)
- [x] 11.3 Реализовать `HoldFileUseCase`, `ReleaseFileHoldUseCase`, `OpenFileForProcessingUseCase`
- [x] 11.4 Прогнать тесты из 11.1 и зафиксировать, что они зелёные (green)

## 12. `files`: ежедневная очистка

- [x] 12.1 Написать тесты:
  - `PurgeExpiredFilesUseCase`:
    - удаляет просроченный документ и запись после снятия удержания;
    - удаляет запись с зависшим удержанием;
    - не трогает удержанную запись в пределах 7 дней и активные документы;
    - отсутствующий объект — не ошибка;
    - сбой `delete` одного файла не останавливает остальные и учитывается в `failed`;
    - обработка пачками.
  - `FilesPurgeScheduler`: регистрирует `upsertJobScheduler('files-purge', { pattern: FILES_PURGE_CRON, tz: 'Europe/Moscow' })` (фейковая очередь).

  Убедиться, что vitest их видит
- [x] 12.2 Прогнать тесты из 12.1 и зафиксировать, что они падают (red)
- [x] 12.3 Реализовать `PurgeExpiredFilesUseCase`, очередь `files-maintenance`, `FilesPurgeScheduler` и `FilesPurgeProcessor`
- [x] 12.4 Прогнать тесты из 12.1 и зафиксировать, что они зелёные (green)

## 13. `files`: HTTP и сборка модуля

- [x] 13.1 Написать тесты контроллера и модуля:
  - **`POST /files`**:
    - multipart с кириллическим именем — 201;
    - без поля `file` — 400;
    - 413 и 415 по ошибкам use case'а;
    - без токена — 401.
  - **Остальные эндпоинты**:
    - `GET /files/:id`: 404 для чужого;
    - `DELETE /files/:id`: 204, повтор — тоже 204;
    - `POST /files/:id/download-link`: 200;
    - `GET /files/:id/content?token=…` без `Authorization`: 200 с `Content-Disposition` RFC 5987, 403 и 410.
  - **Сборка модуля**: `FilesModule` экспортирует только `OpenFileForProcessingUseCase`, `HoldFileUseCase` и `ReleaseFileHoldUseCase`; при старте вызывается `ensureBucket`.
  - **Логи**: `token` из query маскируется в логах pino.

  Убедиться, что vitest их видит
- [x] 13.2 Прогнать тесты из 13.1 и зафиксировать, что они падают (red)
- [x] 13.3 Реализовать `FilesController` (разбор `busboy` потоком, публичный `GET /content`), `FilesModule`, подключить его в `app.module.ts`, добавить redact `token` в настройки pino, Swagger-описания
- [x] 13.4 Прогнать тесты из 13.1 и зафиксировать, что они зелёные (green); `npm test` и `npm run typecheck` проходят целиком

## 14. `transcription`: домен расшифровки встречи

- [x] 14.1 Написать тесты по спеке `meeting-transcription`:
  - `TranscriptSegment` проверяет время и непустой текст;
  - переходы `MeetingTranscript`:
    - `pending → processing → completed`;
    - `complete` с пустыми сегментами даёт `no_speech`;
    - `fail(reason)`;
    - `retry` только из `failed`, иначе ошибка;
    - запрещённые переходы бросают ошибку;
  - `speakerCount` по меткам;
  - события «завершена» и «не удалась» без текста.

  Убедиться, что vitest их видит
- [x] 14.2 Прогнать тесты из 14.1 и зафиксировать, что они падают (red)
- [x] 14.3 Реализовать `MeetingTranscript`, `TranscriptSegment`, `DiarizedTranscript`, `AudioChunk`, `ChunkWord`, статусы, причины и события в `modules/transcription/meeting/domain`
- [x] 14.4 Прогнать тесты из 14.1 и зафиксировать, что они зелёные (green), тесты `TranscribeVoiceUseCase` не сломались

## 15. `transcription`: план кусков, реестр спикеров и склейка (`planChunks`, `SpeakerRegistry`, `TranscriptMerger`)

- [x] 15.1 Написать тесты по design.md (решение 8, пункты 1, 4 и 5) на синтетических данных и обезличенных фикстурах `transcription/meeting/testing/fixtures/scribe-*.json` из спайка 1.2.
  - **`planChunks`**:
    - запись 25 мин при 600 с и перекрытии 30 с даёт 3 куска с правильными границами;
    - короткая запись даёт один кусок.
  - **`SpeakerRegistry`, образцы**:
    - `exemplars()`: самый длинный непрерывный отрезок спикера ≥ 4 с, обрезанный до 10 с от середины, в абсолютном времени;
    - лимит 8 образцов, разговорчивые первыми;
    - у спикера без отрезка ≥ 4 с образца нет.
  - **`SpeakerRegistry`, сопоставление (`ingest`)**:
    - локальная метка с ≥ 60% слов образца получает его глобального спикера (фикстура: образцы 0 и 1, основная часть с метками 0 и 1);
    - два образца с одной локальной меткой сливают глобальных спикеров;
    - метка без образца сопоставляется по перекрытию при ≥ 3 совпавших словах;
    - иначе создаётся новый спикер;
    - слова префикса отброшены, время остальных абсолютное.
  - **`TranscriptMerger`**:
    - на стыке по середине перекрытия нет повторов и потерь;
    - сегменты идут по смене спикера, метки `Спикер N` — в порядке появления;
    - пустой итог даёт `no_speech`;
    - три и более кусков.

  Убедиться, что vitest их видит
- [x] 15.2 Прогнать тесты из 15.1 и зафиксировать, что они падают (red)
- [x] 15.3 Реализовать `planChunks`, `SpeakerRegistry` (с union-find для слияния) и `TranscriptMerger` как чистый доменный код в `transcription/meeting/domain`
- [x] 15.4 Прогнать тесты из 15.1 и зафиксировать, что они зелёные (green)

## 16. `transcription`: нарезка с образцами (`FfmpegAudioChunker`)

- [x] 16.1 Написать интеграционные тесты (пропуск, если `ffmpeg` нет в `PATH`). Входные файлы генерируются в тесте через `ffmpeg -f lavfi -i sine`, параметры уменьшены для скорости.
  - **`probe`**:
    - даёт длительность;
    - длительность больше максимума даёт `too-long`;
    - битый файл даёт `unsupported-media`.
  - **`render` без образцов**: кусок `[start, end)` WAV-файла — ogg/opus mono 16 кГц нужной длительности, меньше `MAX_CHUNK_BYTES`.
  - **`render` с двумя образцами**: длительность файла равна `образцы + 2 × 1 с тишины + кусок`; раскладка префикса (`prefixSec` и интервалы образцов) совпадает с фактической длительностью (`ffprobe` готового файла).
  - **Видео**: mp4 с видеодорожкой даёт файл только со звуком.
  - **Отмена**: `AbortSignal` убивает процесс `ffmpeg`.

  Убедиться, что vitest их видит
- [x] 16.2 Прогнать тесты из 16.1 и зафиксировать, что они падают (red)
- [x] 16.3 Реализовать `AudioChunkerPort` (`probe`, `render`) и `FfmpegAudioChunker` (`spawn` `ffprobe` и `ffmpeg`, фильтр `concat`, параметры из design.md, решение 8), проверку `ffmpeg -version` при старте модуля
- [x] 16.4 Прогнать тесты из 16.1 и зафиксировать, что они зелёные (green)

## 17. `transcription`: провайдер куска (`OpenRouterChunkTranscriber`)

- [x] 17.1 Написать тесты с подменённым `fetch`:
  - тело запроса: модель из env, `input_audio` base64 ogg, `verbose_json`, `diarize: true`, `language` только если задан;
  - разбор `words` фикстуры 1.3 в `ChunkWord` (поле метки по итогам 1.2);
  - пустой ответ — пустой список слов;
  - коды ответа: 429 и 5xx — временная ошибка, 400, 413 и 422 — постоянная, 401 и 403 — временная;
  - таймаут 90 с через `AbortSignal`;
  - до 2 повторов куска при временной ошибке;
  - в логах нет текста.

  Убедиться, что vitest их видит
- [x] 17.2 Прогнать тесты из 17.1 и зафиксировать, что они падают (red)
- [x] 17.3 Реализовать `ChunkTranscriberPort` и `OpenRouterChunkTranscriber`
- [x] 17.4 Прогнать тесты из 17.1 и зафиксировать, что они зелёные (green)

## 18. `transcription`: последовательная сборка (`ChunkedMeetingTranscriber`)

- [x] 18.1 Написать тесты с фейковыми чанкером и провайдером:
  - **временная папка**: поток пишется в неё, и она удаляется и при успехе, и при ошибке;
  - **порядок кусков**: куски обрабатываются строго последовательно, следующий кусок не запускается до ответа на предыдущий;
  - **образцы**: первый кусок рендерится без образцов, каждый следующий — с `registry.exemplars()` после `ingest` предыдущего;
  - **результат**: итог собирается `TranscriptMerger`;
  - **ошибки**: постоянная ошибка куска останавливает обработку и пробрасывается, временная после повторов пробрасывается как временная.

  Убедиться, что vitest их видит
- [x] 18.2 Прогнать тесты из 18.1 и зафиксировать, что они падают (red)
- [x] 18.3 Реализовать `ChunkedMeetingTranscriber`. Заменить в `env.schema.ts` и `.env.example` переменную `MEETING_TRANSCRIPTION_CHUNK_CONCURRENCY` на `MEETING_TRANSCRIPTION_MAX_EXEMPLARS=8` и `MEETING_TRANSCRIPTION_EXEMPLAR_SEC=10`, если группа 2 добавила первую
- [x] 18.4 Прогнать тесты из 18.1 и зафиксировать, что они зелёные (green)

## 19. `transcription`: миграция и репозиторий расшифровок

- [x] 19.1 Написать интеграционные тесты (пропуск без `PROGRAMS_ETL_TEST_ADMIN_URL`):
  - миграция `021_meeting_transcripts.sql`: `file_id` PK со ссылкой на `stored_file`, `CHECK` статуса и причины;
  - `insertPendingIfAbsent` при повторе не создаёт дубля;
  - `save` и `findByFileId` восстанавливают сегменты из JSONB;
  - события сохраняются в той же транзакции.

  Убедиться, что vitest их видит
- [x] 19.2 Прогнать тесты из 19.1 и зафиксировать, что они падают (red)
- [x] 19.3 Написать миграцию, реализовать `SlonikMeetingTranscriptRepository`, зарегистрировать события `meeting-transcript.completed` и `meeting-transcript.failed`
- [x] 19.4 Прогнать тесты из 19.1 и зафиксировать, что они зелёные (green)

## 20. `transcription`: запуск по событию

- [x] 20.1 Написать тесты:
  - `StartMeetingTranscriptionOnFileUploaded`: для `recording` создаёт `pending` и ставит job с `jobId = fileId`, для `document` ничего не делает, повторная доставка не создаёт второй расшифровки и второго job'а;
  - `BullMeetingTranscriptionQueue`: дубль `jobId` не бросает ошибку (фейковая очередь).

  Убедиться, что vitest их видит
- [x] 20.2 Прогнать тесты из 20.1 и зафиксировать, что они падают (red)
- [x] 20.3 Реализовать подписчика (подписка на `file.uploaded` в `DomainEventRegistry`), `MeetingTranscriptionQueuePort` и `BullMeetingTranscriptionQueue` (очередь `meeting-transcription`)
- [x] 20.4 Прогнать тесты из 20.1 и зафиксировать, что они зелёные (green)

## 21. `transcription`: `TranscribeMeetingUseCase` и процессор

- [x] 21.1 Написать тесты:
  - **`TranscribeMeetingUseCase`**:
    - успех: `processing` → `completed`, сегменты, событие «завершена», `ReleaseFileHold`;
    - пустой результат — `no_speech`;
    - временная ошибка на непоследней попытке пробрасывается без смены статуса на `failed`;
    - временная ошибка на последней попытке — `failed('provider-unavailable')`, событие, снятие удержания;
    - постоянные ошибки дают `failed` сразу: `too-long`, `unsupported-media`, удалённый файл;
    - лог без текста и имени файла, с длительностью, числом спикеров и исходом.
  - **`MeetingTranscriptionProcessor`**:
    - считает `isFinalAttempt` по `attemptsMade`;
    - постоянную ошибку отдаёт как `UnrecoverableError`;
    - `concurrency` берётся из env.

  Убедиться, что vitest их видит
- [x] 21.2 Прогнать тесты из 21.1 и зафиксировать, что они падают (red)
- [x] 21.3 Реализовать `TranscribeMeetingUseCase` и `MeetingTranscriptionProcessor`
- [x] 21.4 Прогнать тесты из 21.1 и зафиксировать, что они зелёные (green)

## 22. `transcription`: HTTP, повтор и сборка модуля

- [x] 22.1 Написать тесты:
  - **`GetMeetingTranscriptUseCase`**:
    - для `processing` — статус без сегментов;
    - для `completed` — сегменты;
    - чужая и несуществующая расшифровка — 404;
    - расшифровка доступна после удаления файла.
  - **`RetryMeetingTranscriptionUseCase`**:
    - из `failed` — 202 и `pending`, удержание восстановлено, новый job;
    - не `failed` — 409;
    - файл удалён — 410.
  - **`MeetingTranscriptsController`**: коды ответов.
  - **Сборка модуля**: `TranscriptionModule` подключает `FilesModule`, а прежний экспорт `TranscribeVoiceUseCase` не меняется.

  Убедиться, что vitest их видит
- [x] 22.2 Прогнать тесты из 22.1 и зафиксировать, что они падают (red)
- [x] 22.3 Реализовать use case'ы, `MeetingTranscriptsController` и сборку в `TranscriptionModule`
- [x] 22.4 Прогнать тесты из 22.1 и зафиксировать, что они зелёные (green); `npm test` и `npm run typecheck` проходят целиком

## 23. Проверка на живом стенде и документация

- [x] 23.1 Поднять стек (`docker compose up --build`) и проверить вручную через Swagger или curl:
  - загрузка `xlsx`: 201 с документом на 30 дней;
  - загрузка WAV на ~200 МБ длительностью ~1 час: 201, затем `GET /transcripts/:fileId` проходит `processing → completed`, сегменты покрывают час, метки спикеров сквозные;
  - ссылка на скачивание работает без `Authorization` и истекает через 5 минут;
  - удаление файла оставляет расшифровку.

  Зафиксировать время обработки и стоимость в design.md
- [x] 23.2 Проверить очистку: временно уменьшить сроки в `.env`, вызвать job `files-purge` вручную, убедиться, что объекты пропали из MinIO, строки в статусе `deleted`, расшифровка доступна. Вернуть сроки
- [x] 23.3 Написать README модулей `files` и `transcription` (раздел о расшифровке встреч):
  - API и сроки хранения;
  - переменные окружения;
  - требования: `ffmpeg`, место во временной папке, `client_max_body_size` у reverse proxy;
  - куда уходят записи (OpenRouter → ElevenLabs).

  Проверка — README соответствуют коду и `.env.example`

## 24. Code review

- [x] 24.1 Запустить code-review (скилл `code-review`) по всем изменениям фичи - от коммита, с которого начат change, до текущего HEAD: соответствие стандартам проекта и specs этого change
- [ ] 24.2 Исправить замечания ревью (блокирующие и существенные обязательно; остальные - исправить или явно отклонить с обоснованием), результат зафиксировать коммитом (исправления сделаны, коммит не выполнен по решению workflow)
- [x] 24.3 Повторить code-review по правкам из 24.2 и убедиться, что блокирующих замечаний нет; прогнать тесты и зафиксировать, что они зелёные
