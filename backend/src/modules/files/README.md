# files

Хранилище файлов пользователей: таблицы и документы, записи встреч. Содержимое лежит в S3 (локально MinIO из `docker-compose.yml`), метаданные — в Postgres (`stored_file`, миграция `db/migrations/020_files.sql`). Модуль ничего не знает о расшифровке: о загрузке и удалении файла он сообщает событиями `file.uploaded` и `file.deleted`, а держит запись до конца обработки через публичные use case'ы.

## API

Все маршруты, кроме скачивания по ссылке, требуют `Authorization: Bearer <accessToken>`. Swagger: `/docs`, тег `files`. Файл видит только владелец: чужой и несуществующий файл одинаково дают 404 `FILE_NOT_FOUND`.

| Маршрут | Что делает | Ответы |
| --- | --- | --- |
| `POST /files` | Загрузка одного файла, multipart-поле `file`. Поток идёт сразу в S3, на диск контейнера не пишется | 201 метаданные; 400 нет файла, пустой файл или битый multipart; 413 `FILE_TOO_LARGE`; 415 `FILE_UNSUPPORTED_MEDIA_TYPE` |
| `GET /files/:id` | Метаданные, в том числе удалённого файла (`status: "deleted"`, `deletedAt`) | 200; 404 |
| `DELETE /files/:id` | Удаляет содержимое. Метаданные остаются со статусом `deleted`, расшифровка записи остаётся | 204, в том числе для уже удалённого; 404 |
| `POST /files/:id/download-link` | Короткая ссылка `{ url: "/files/:id/content?token=…", expiresAt }` | 200; 404; 410 `FILE_GONE`; 503 `FILE_DOWNLOAD_LINKS_UNAVAILABLE`, если не задан `FILES_DOWNLOAD_TOKEN_SECRET` |
| `GET /files/:id/content?token=…` | Скачивание без `Authorization` (браузерные загрузчики не умеют его слать). Ответ — вложение с исходным именем и `X-Content-Type-Options: nosniff` | 200; 403 `FILE_DOWNLOAD_TOKEN_INVALID` (истёк, подделан, от другого файла); 410 |

Метаданные: `id`, `name`, `mediaType`, `kind` (`document` | `recording`), `sizeBytes`, `status` (`active` | `deleted`), `awaitingProcessing` (запись ещё удерживается для расшифровки), `uploadedAt`, `expiresAt`, `deletedAt`.

Тип определяется по содержимому (`file-type`), а не по имени и не по заголовку клиента:

- документы: xlsx, xls, csv, docx, doc, pdf, txt. У csv и txt нет сигнатуры: они принимаются по расширению, если первые байты — корректный UTF-8. Старые xls и doc (контейнер cfb) различаются по расширению;
- записи: mp3, m4a/mp4, ogg/opus, wav, webm, flac, mp4-видео.

Остальное, в том числе исполняемый файл с расширением `.xlsx`, даёт 415.

Ссылка на скачивание — JWT с отдельным секретом, `aud: file-download`, `sub: fileId`, живёт `FILES_DOWNLOAD_LINK_TTL_SEC` (5 минут). Токен из query в лог не пишется (redact).

## Сроки хранения

- Документ хранится `FILES_DOCUMENT_RETENTION_DAYS` (30 дней) с момента загрузки.
- Запись удерживается до конца расшифровки (`HoldFile` / `ReleaseFileHold`), затем хранится ещё `FILES_RECORDING_RETENTION_DAYS` (1 день).
- Если удержание не сняли (обработка зависла), оно действует не дольше `FILES_MAX_HOLD_DAYS` (7 дней), и срок считается от его конца: 7 + 1 день.

Очистку делает job `purge-expired-files` в очереди BullMQ `files-maintenance` по расписанию `FILES_PURGE_CRON` (по умолчанию `0 3 * * *`, Europe/Moscow; job scheduler даёт один запуск на кластер). Он пачками по 100 (курсор по `uploaded_at, id`, поэтому упавшие файлы не загораживают остальные) удаляет объекты из S3 (отсутствие объекта — не ошибка) и переводит строки в `deleted`. Перед удалением строка перечитывается под блокировкой (`SELECT … FOR UPDATE`): если владелец за это время удалил файл или снова поставил удержание, файл пропускается. Сбой одного файла логируется, очистка идёт дальше. Строки файлов физически не удаляются, расшифровки записей остаются.

## Для других модулей

`FilesModule` экспортирует только:

- `OpenFileForProcessingUseCase` — поток и метаданные по `fileId` без проверки владельца, только для внутренних потребителей; `null`, если файла нет или он удалён;
- `HoldFileUseCase` — снова удержать запись (повтор расшифровки), 410 для удалённой;
- `ReleaseFileHoldUseCase` — снять удержание после обработки.

События пишутся в outbox в одной транзакции со строкой `stored_file`, их регистрирует `contracts/register-file-events.ts`:

- `file.uploaded` (`fileId`, `ownerId`, `kind`, `mediaType`, `sizeBytes`);
- `file.deleted` (`fileId`, `ownerId`, `kind`, `cause`: `owner` — удалил владелец, `retention` — удалила очистка). По нему модуль расшифровки закрывает незавершённую расшифровку.

Удаление, очистка, `HoldFile` и `ReleaseFileHold` меняют строку в транзакции под `SELECT … FOR UPDATE`. Так параллельные операции не перетирают друг друга: снятие удержания не «воскресит» уже удалённый файл.

## Переменные окружения

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `S3_ENDPOINT` | `http://localhost:9000` | Адрес S3. В compose бэкенд ходит на `http://minio:9000` |
| `S3_REGION` | `us-east-1` | Регион |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | `minioadmin` вне production | Ключи; в compose совпадают с `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`. При `NODE_ENV=production` обязательны |
| `S3_BUCKET` | `files` | Бакет; бэкенд создаёт его при старте, если его нет |
| `S3_FORCE_PATH_STYLE` | `true` | Path-style адреса (нужно для MinIO) |
| `FILES_MAX_RECORDING_MB` | `1024` | Лимит записи |
| `FILES_MAX_DOCUMENT_MB` | `50` | Лимит документа |
| `FILES_DOCUMENT_RETENTION_DAYS` | `30` | Срок документа |
| `FILES_RECORDING_RETENTION_DAYS` | `1` | Срок записи после расшифровки |
| `FILES_MAX_HOLD_DAYS` | `7` | Максимум удержания записи |
| `FILES_PURGE_CRON` | `0 3 * * *` | Расписание очистки |
| `FILES_DOWNLOAD_TOKEN_SECRET` | не задан | Секрет ссылок, минимум 32 символа (`openssl rand -base64 48`). Без него выдача ссылок отвечает 503 |
| `FILES_DOWNLOAD_LINK_TTL_SEC` | `300` | Время жизни ссылки |

## Развёртывание

- MinIO наружу не публикуется (порты только на `127.0.0.1`), файлы отдаёт бэкенд.
- Reverse proxy перед бэкендом должен пропускать тело до лимита записи: у nginx `client_max_body_size 1100m;` (по умолчанию 1 МБ), а также увеличенные `proxy_read_timeout` / `proxy_send_timeout` и `proxy_request_buffering off;`, чтобы загрузка на 1 ГБ не буферизовалась на прокси.
- Память на загрузку ограничена частями `@aws-sdk/lib-storage` (8 МБ × 4 параллельно).
- Если клиент оборвал загрузку, поток файла завершается ошибкой, и незавершённый multipart upload отменяется. Если процесс упал посреди загрузки, части остаются в бакете: MinIO удаляет их сам (`api.stale_uploads_expiry`, по умолчанию 24 ч). Правило lifecycle `AbortIncompleteMultipartUpload` MinIO не принимает; для AWS S3 его стоит добавить на бакет.
- Если запись в БД упала после успешного `put`, объект удаляется (компенсация). Если упала и компенсация, в бакете остаётся объект-сирота; сверки бакета с БД пока нет.

## Структура

- `domain`: агрегат `StoredFile`, `FileName`, `MediaType` (белый список), `RetentionPolicy`, `Retention`, события `FileUploadedEvent` и `FileDeletedEvent`, порты (`ObjectStoragePort`, `StoredFileRepositoryPort`, `DownloadTokenPort`, `MediaTypeDetectorPort`, `FilesSettingsPort`, `FilesClockPort`).
- `application`: use case'ы загрузки, чтения, удаления, ссылок, скачивания, очистки, удержания и тестовые двойники (`test-doubles.ts`).
- `infrastructure`: `ObjectStorage`, `StoredFileRepository`, `MediaTypeDetector`, `DownloadTokenService`, очередь `files-maintenance` (`FilesPurgeScheduler`, `FilesPurgeProcessor`).
- `interface`: `FilesController` (multipart разбирается `busboy` потоком), коды ошибок → HTTP-статусы.
- `contracts`: регистрация событий `file.uploaded` и `file.deleted` для подписчиков.

В лог попадают только `id` файлов, итог очистки и вид сбоя. Имена файлов и содержимое в лог не попадают.
