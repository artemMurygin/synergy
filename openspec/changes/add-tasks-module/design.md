## Context

Мотивация и состав изменения: `proposal.md`; требования: `specs/task-management`, `specs/task-attachments`.

Текущее состояние:
- Бэкенд: NestJS 12, PostgreSQL через Slonik, SQL-миграции в `db/migrations` (последняя `013_auth.sql`), модули по слоям `domain / application / infrastructure / interface` с портами, zod для валидации (`ZodValidationPipe`, `zodToOpenApi`), общая пагинация `paginationQuerySchema` (`limit`, `page`), коды ошибок модулей регистрируются через `error-status.registry`.
- Пользователи живут только в `auth_users` (id, login, is_active). Таблица `employee` (сотрудники CRM) с ними не связана и в этом change не используется.
- Глобальный `JwtAuthGuard` из `add-jwt-auth-module` защищает все маршруты, `@CurrentUser()` отдаёт `{ id, sessionId, mustChangePassword }`.
- Файлового хранилища в проекте нет. `@nestjs/platform-express` (а значит multer) уже подключён.

## Goals / Non-Goals

**Goals:**
- Контракт задачи, который переживёт добавление ролей и приоритета без ломающих миграций.
- Хранилище файлов, заменяемое на S3-совместимое одним адаптером.
- Проверка прав в одной точке, чтобы роли добавлялись без правки контроллеров и use-case-ов.

**Non-Goals:**
- Роли и права (все видят и меняют всё), комментарии, история изменений, подзадачи, теги, приоритет, повторяющиеся задачи.
- Уведомления ответственному и наблюдателям.
- Клиентская часть (расширение, Electron).
- Фоновая очистка файлов удалённых задач.
- Антивирусная проверка и ограничение по типам файлов.

## Decisions

### 1. Модель данных (миграция `014_tasks.sql`)
- `task`: `id UUID PK`, `title TEXT (1..200)`, `description TEXT NOT NULL DEFAULT ''`, `status TEXT CHECK IN ('todo','in_progress','done') DEFAULT 'todo'`, `deadline TIMESTAMPTZ NULL`, `creator_id UUID NOT NULL REFERENCES auth_users`, `assignee_id UUID NULL REFERENCES auth_users ON DELETE SET NULL`, `created_at`, `updated_at`, `completed_at NULL`, `deleted_at NULL`.
- `task_watcher (task_id, user_id)` с составным PK, `ON DELETE CASCADE` по задаче и пользователю.
- `task_attachment`: `id UUID PK`, `task_id UUID REFERENCES task ON DELETE CASCADE`, `original_name`, `storage_key` (уникальный), `size_bytes BIGINT`, `content_type`, `uploaded_by UUID REFERENCES auth_users`, `created_at`.
- Индексы: `task(status)`, `task(assignee_id)`, `task(creator_id)`, `task(deadline)` и `task(created_at DESC)`, частичные по `deleted_at IS NULL`; `task_watcher(user_id)`.
- `creator_id` без `ON DELETE`: пользователей `auth` не удаляют, а отключают (`is_active`).
Альтернативы: массив `watcher_ids UUID[]` в `task` (проще, но нет FK и индексов по наблюдателю); JSONB для вложений (нет целостности, неудобно считать лимит).

### 2. Мягкое удаление
`deleted_at` + все выборки по `deleted_at IS NULL`. Причина: задачи могут понадобиться для разбора и восстановления, а физическое удаление вместе с файлами необратимо. Файлы удалённой задачи остаются на диске (очистка вне scope). Альтернатива: физическое удаление с каскадом, но тогда нужна согласованная чистка диска при каждом удалении.

### 3. Статусы и закрытие
Три статуса, переходы свободны (нет конечного автомата: правила workflow появятся с ролями). `completed_at` вычисляется в домене: в `done` — устанавливается, если ранее не было; выход из `done` — сбрасывается. Статус хранится как `TEXT + CHECK`, а не как enum PostgreSQL: добавление значения не требует `ALTER TYPE`.

### 4. Ссылки на пользователей и ответ API
Ответственный и наблюдатели в запросе — идентификаторы `auth_users`. Перед записью use-case проверяет через порт `UserDirectory` (`findActiveByIds`), что все они существуют и активны, иначе ошибка `TASK_USER_NOT_FOUND` (422). В ответе пользователь — `{ id, login }`. Порт, а не прямой импорт репозитория auth, чтобы `tasks` не зависел от внутренностей `auth`; реализация читает `auth_users` одним SQL-запросом в инфраструктуре tasks.
Альтернатива: импортировать `UserRepository` из auth (жёсткая связность модулей); использовать `employee` (нет логина и связи с токеном).

### 5. Файлы: порт `FileStorage` и диск
Порт: `save(stream, { maxBytes }) → { storageKey, size }`, `open(storageKey) → stream`, `delete(storageKey)`. Реализация `LocalDiskFileStorage` пишет в `TASKS_STORAGE_DIR` под ключом `<uuid>` (без исходного имени и расширения), в подкаталог по первым двум символам, чтобы не копить десятки тысяч файлов в одном каталоге. Загрузка через `FileInterceptor` с multer в режиме `memoryStorage` неприемлема для 20 МБ × параллельные запросы, поэтому используется потоковая запись с лимитом multer `limits.fileSize`; при превышении частичный файл удаляется, ответ 413.
Порядок при загрузке: проверка существования задачи и лимита числа вложений → запись файла → запись метаданных в БД; если запись в БД упала, файл удаляется компенсирующим действием. Порядок при удалении: удалить запись в БД, затем файл; потерянный файл допустим (остаток на диске), потерянная запись при живой метаданной — нет.
Скачивание: `Content-Disposition: attachment; filename*=UTF-8''…`, `X-Content-Type-Options: nosniff`, тип содержимого из метаданных.
Альтернативы: S3/MinIO с presigned URL (правильнее для нескольких инстансов, но тянет инфраструктуру; адаптер добавляется позже без изменения домена); хранение BYTEA в PostgreSQL (раздувает БД и бэкапы).

### 6. Файл отдельным запросом
CRUD задачи остаётся JSON, а `POST /tasks/{id}/attachments` — multipart. Альтернатива: один multipart-запрос на создание задачи с файлами (смешивает форматы, усложняет валидацию и откат).

### 7. Список, фильтры, сортировка
Один SQL-запрос со сборкой `WHERE` из переданных фильтров (Slonik `sql.fragment`) и отдельный `COUNT(*)`. Фильтр по наблюдателю — через `EXISTS` на `task_watcher`. Сортировка только по белому списку колонок (`deadline`, `createdAt`, `updatedAt`) и направлению; при сортировке по `deadline` значения `NULL` идут последними. `overdue` вычисляется в SQL как `deadline < now() AND status <> 'done'`. Ответ: `{ items, total, limit, page }`.

### 8. Проверка прав
Все use-case-ы принимают `actor: { userId }` и вызывают порт `TaskAccessPolicy` (`canRead/canUpdate/canDelete`). Сейчас реализация `AllowAllTaskAccessPolicy` всегда разрешает. Когда появится ролевая модель, меняется только реализация. Альтернатива: не вводить порт (проще сейчас, но проверки пришлось бы вставлять в каждый use-case позднее).

### 9. Ошибки
Коды модуля регистрируются через `registerErrorStatuses`: `TASK_NOT_FOUND` → 404, `TASK_ATTACHMENT_NOT_FOUND` → 404, `TASK_USER_NOT_FOUND` → 422, `TASK_ATTACHMENT_LIMIT` → 422, `TASK_ATTACHMENT_TOO_LARGE` → 413. Валидация входа — `ZodValidationPipe` (400).

### 10. Конфигурация
В `env.schema.ts`: `TASKS_STORAGE_DIR` (по умолчанию `./storage/tasks`), `TASKS_MAX_FILE_SIZE_MB` (20), `TASKS_MAX_FILES_PER_TASK` (10).

## Risks / Trade-offs

- [Файлы на локальном диске не переживают пересоздание контейнера и не делятся между инстансами] → том для `TASKS_STORAGE_DIR`, порт `FileStorage` для будущего S3; ограничение зафиксировано в Impact.
- [Расхождение БД и диска при сбое между записью файла и записью метаданных] → компенсирующее удаление файла; потерянные файлы безопасны (недоступны через API), очистка отдельным change.
- [Все видят и меняют всё] → сознательное решение на текущий этап; точка расширения `TaskAccessPolicy`.
- [Загрузка больших файлов блокирует соединения] → лимит 20 МБ, потоковая запись; общий rate limit вне scope.
- [Смена ответственного без уведомления] → уведомления вне scope; поле `updated_at` позволит клиентам опрашивать изменения.
- [Подмена типа содержимого и XSS через скачиваемый файл] → `attachment` + `nosniff`, имя в пути не используется.

## Migration Plan

1. Слить `add-jwt-auth-module`, чтобы `auth_users` и `@CurrentUser()` были в ветке.
2. Применить `014_tasks.sql` (миграции выполняются при старте). Откат: удалить три таблицы, миграция чисто аддитивная.
3. Создать и смонтировать каталог `TASKS_STORAGE_DIR`, добавить в бэкап.
4. Деплой бэкенда; клиентов пока нет, обратная совместимость не затрагивается.

## Open Questions

- Нужна ли в списке выдача по полному тексту описания (сейчас только подстрока в названии)? Можно добавить позже без изменения остального контракта.
- Нужно ли при отключении пользователя (`is_active = false`) автоматически снимать его с ответственных? Сейчас не снимаем, задача остаётся с неактивным ответственным.
