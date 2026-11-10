## 1. Миграция, конфигурация, каркас модуля

- [x] 1.1 Написать spec миграции `014_tasks.sql` по образцу `auth-migration.spec.ts`: проверяет таблицы `task`, `task_watcher`, `task_attachment`, `CHECK` на статус и длину названия, составной PK наблюдателей, каскады, уникальность `storage_key`, индексы. Убедиться, что раннер его видит
- [x] 1.2 Прогнать spec из 1.1: red (миграции нет)
- [x] 1.3 Создать `backend/db/migrations/014_tasks.sql` по `design.md` (п. 1): `task` (с `deleted_at`), `task_watcher`, `task_attachment`, индексы с частичным условием `deleted_at IS NULL`
- [x] 1.4 Прогнать spec из 1.1: зелёный; соседние migration-спеки не сломаны
- [x] 1.5 Расширить `shared/config/env.schema.ts` переменными `TASKS_STORAGE_DIR` (`./storage/tasks`), `TASKS_MAX_FILE_SIZE_MB` (20), `TASKS_MAX_FILES_PER_TASK` (10), дополнить `env.schema.spec.ts` (значения по умолчанию, невалидные значения) и `.env.example`. Проверка: `env.schema.spec.ts` зелёный
- [x] 1.6 Создать каркас `backend/src/modules/tasks/{domain,application,infrastructure,interface/http}`, пустой `TasksModule`, подключить его в `app.module.ts`, добавить `storage/` в `.gitignore`. Проверка: `npm run typecheck` в `backend/` проходит, приложение стартует

## 2. Domain: value objects (TDD)

- [x] 2.1 Написать тесты на `TaskTitle` (trim, пусто, длина > 200), `TaskStatus` (три значения, неизвестное отклоняется), `FileName` (очистка `../../etc/passwd`, управляющих символов, обрезка до 255, пустое после очистки), `TaskFilter`/`TaskSort` (белый список полей и направлений), `Actor`. Раннер их видит
- [x] 2.2 Прогнать тесты из 2.1: red (классов нет)
- [x] 2.3 Реализовать `TaskTitle`, `TaskStatus`, `FileName`, `TaskFilter`, `TaskSort`, `Actor` в `modules/tasks/domain`
- [x] 2.4 Прогнать тесты из 2.1: зелёные, регрессий нет

## 3. Domain: агрегат Task (TDD)

- [x] 3.1 Написать тесты по `specs/task-management`: создание с минимумом полей (статус `todo`, пустое описание, без ответственного и наблюдателей); `description` > 10000 отклоняется; `replaceWatchers` убирает повторы и отклоняет > 50; `changeStatus`: в `done` ставит `completedAt`, из `done` сбрасывает, повторный `done` не сдвигает; `creatorId` неизменен; удалённая задача не изменяется; `softDelete` ставит `deletedAt`. Раннер их видит
- [x] 3.2 Прогнать тесты из 3.1: red
- [x] 3.3 Реализовать `Task` (на `AggregateRoot` из `shared/ddd`), доменные ошибки (`TaskNotFoundError`, `TaskUserNotFoundError`, `AttachmentNotFoundError`, `AttachmentLimitReachedError`, `AttachmentTooLargeError`, коды `TaskErrorCode`) и порты `TaskRepository`, `UserDirectory`, `TaskAccessPolicy`, `Clock`
- [x] 3.4 Прогнать тесты из 3.1: зелёные, регрессий нет

## 4. Application: CRUD задач (TDD)

- [x] 4.1 Написать тесты на use-case-ы с фейковыми портами (in-memory `TaskRepository`, `UserDirectory`, `TaskAccessPolicy`): `CreateTaskUseCase` (создатель из `Actor`, игнор чужого создателя, `TaskUserNotFound` для неактивного ответственного или наблюдателя); `GetTaskUseCase` (404 для отсутствующей и удалённой); `UpdateTaskUseCase` (частичное изменение, `deadline: null`, `assigneeId: null`, замена наблюдателей, смена статуса и `completedAt`, проверка новых участников); `DeleteTaskUseCase` (мягкое удаление, повтор даёт 404); все use-case-ы вызывают `TaskAccessPolicy`, отказ политики прерывает действие. Раннер их видит
- [x] 4.2 Прогнать тесты из 4.1: red
- [x] 4.3 Реализовать `CreateTaskUseCase`, `GetTaskUseCase`, `UpdateTaskUseCase`, `DeleteTaskUseCase` и `AllowAllTaskAccessPolicy`
- [x] 4.4 Прогнать тесты из 4.1: зелёные, регрессий нет

## 5. Application: список задач (TDD)

- [x] 5.1 Написать тесты `ListTasksUseCase` на in-memory репозитории: фильтры по статусу, создателю, ответственному, наблюдателю, `overdue` (дедлайн в прошлом и статус не `done`), подстрока в названии; комбинирование по «И»; сортировка по умолчанию (новые первыми); пагинация и `total`; удалённые не попадают. Раннер их видит
- [x] 5.2 Прогнать тесты из 5.1: red
- [x] 5.3 Реализовать `ListTasksUseCase` и контракт `TaskRepository.list(filter, sort, page)`
- [x] 5.4 Прогнать тесты из 5.1: зелёные, регрессий нет

## 6. Application: вложения (TDD)

- [x] 6.1 Написать тесты с фейковыми `FileStorage`, `TaskAttachmentRepository`, `TaskRepository`: `UploadAttachmentUseCase` (успех; задача не найдена: файл не пишется; лимит числа файлов: файл не пишется; превышение размера: файл удалён, вложения нет; сбой записи метаданных: компенсирующее `FileStorage.delete`); `DownloadAttachmentUseCase` (успех; вложение чужой задачи: 404; файл потерян в хранилище: 404 и запись в лог); `DeleteAttachmentUseCase` (удаляет запись и затем файл, повтор: 404, сбой удаления файла не ломает ответ). Раннер их видит
- [x] 6.2 Прогнать тесты из 6.1: red
- [x] 6.3 Реализовать `UploadAttachmentUseCase`, `DownloadAttachmentUseCase`, `DeleteAttachmentUseCase`, `TaskAttachment`, порты `FileStorage`, `TaskAttachmentRepository`, `TasksSettings`
- [x] 6.4 Прогнать тесты из 6.1: зелёные, регрессий нет

## 7. Infrastructure: PostgreSQL (TDD)

- [x] 7.1 Написать интеграционные тесты по образцу `postgres-chat-session-repository.spec.ts`: `SlonikTaskRepository` (сохранение и чтение задачи с наблюдателями, замена наблюдателей, мягкое удаление, все фильтры списка, `overdue`, сортировка по `deadline` с `NULL` в конце, `total`, `EXISTS` по наблюдателю), `SlonikTaskAttachmentRepository` (вставка, подсчёт, поиск в рамках задачи, удаление), `SlonikUserDirectory.findActiveByIds` (отключённые и несуществующие не возвращаются). Раннер их видит
- [x] 7.2 Прогнать тесты из 7.1: red
- [x] 7.3 Реализовать `SlonikTaskRepository`, `SlonikTaskAttachmentRepository`, `SlonikUserDirectory` в `modules/tasks/infrastructure`, сборку `WHERE` через `sql.fragment` и белый список сортировки
- [x] 7.4 Прогнать тесты из 7.1: зелёные, регрессий нет

## 8. Infrastructure: файловое хранилище (TDD)

- [x] 8.1 Написать тесты `LocalDiskFileStorage` на временном каталоге: `save` пишет под ключом `<uuid>` в подкаталог по двум символам и возвращает размер; исходное имя в пути не участвует; при превышении `maxBytes` частичный файл удаляется и бросается `AttachmentTooLargeError`; `open` читает поток; `open` несуществующего ключа бросает ошибку «не найден»; `delete` идемпотентен; ключ с `..` отвергается. Раннер их видит
- [x] 8.2 Прогнать тесты из 8.1: red
- [x] 8.3 Реализовать `LocalDiskFileStorage` и `EnvTasksSettings`
- [x] 8.4 Прогнать тесты из 8.1: зелёные, регрессий нет

## 9. Interface: HTTP (TDD)

- [x] 9.1 Написать тесты контроллеров по образцу `agent.controller.spec.ts`: `TasksController` (201 создание, 200 получение, список с query-фильтрами и пагинацией, PATCH, 204 удаление, 400 для пустого названия, пустого PATCH, неизвестного статуса и `limit` > максимума, 404, 422 `TASK_USER_NOT_FOUND`, 401 без токена); `TaskAttachmentsController` (201 загрузка multipart, 400 без файла, 413 слишком большой, 422 лимит числа, скачивание с `Content-Disposition: attachment`, `filename*=UTF-8''…` и `X-Content-Type-Options: nosniff`, 204 удаление, 404). Раннер их видит
- [x] 9.2 Прогнать тесты из 9.1: red
- [x] 9.3 Реализовать `TasksController`, `TaskAttachmentsController` (multer с `limits.fileSize`, потоковая запись), `tasks.schemas.ts` (zod, `zodToOpenApi`), ответы `TaskResponse`/`AttachmentResponse` (пользователь как `{ id, login }`), `registerTaskErrorStatuses` (404, 422, 413), Swagger-описания и `@ApiBearerAuth`
- [x] 9.4 Прогнать тесты из 9.1: зелёные, регрессий нет

## 10. Подключение модуля и сквозная проверка

- [ ] 10.1 Написать e2e-тест (по образцу `audit-flow.e2e.spec.ts`): login → создать задачу с ответственным и наблюдателями → загрузить файл → получить задачу с вложением → скачать файл и сравнить байты → сменить статус на `done` → найти в списке по фильтрам → удалить вложение → удалить задачу → получить 404. Прогнать: red
- [x] 10.2 Связать провайдеры в `TasksModule` (порты → реализации, `PostgresModule`), вызвать `registerTaskErrorStatuses`, убедиться, что `JwtAuthGuard` защищает маршруты
- [ ] 10.3 Прогнать тест из 10.1: зелёный; `npm run typecheck`, `npm run lint`, `npm test` в `backend/` без регрессий
- [x] 10.4 Обновить `backend/README.md` (модуль задач, переменные окружения, требование монтировать `TASKS_STORAGE_DIR` на постоянный том и включать в бэкап) и проверить, что Swagger (`/docs`) показывает все эндпоинты задач

## 11. Code review

- [ ] 11.1 Запустить code-review (скилл `code-review`) по всем изменениям фичи - от коммита, с которого начат change, до текущего HEAD: соответствие стандартам проекта и specs этого change
- [ ] 11.2 Исправить замечания ревью (блокирующие и существенные обязательно; остальные - исправить или явно отклонить с обоснованием), результат зафиксировать коммитом
- [ ] 11.3 Повторить code-review по правкам из 11.2 и убедиться, что блокирующих замечаний нет; прогнать тесты и зафиксировать, что они зелёные
