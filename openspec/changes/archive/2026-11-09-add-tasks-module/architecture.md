# Architecture: add-tasks-module

## Scope
Новый бэкенд-модуль `tasks` (NestJS, PostgreSQL через Slonik) в слоях `domain / application / infrastructure / interface`, как в `auth` и `sheets-qa`. Зависит от `auth` только через порт `UserDirectory` (чтение `auth_users`) и декоратор `@CurrentUser()`. Фронтенда в этом change нет.

---

## Backend — Domain Model

### Entities
| Name | Status | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `Task` | new | да | `id`, `title: TaskTitle`, `description`, `status: TaskStatus`, `deadline: Date \| null`, `creatorId`, `assigneeId \| null`, `watcherIds: UserId[]`, `createdAt`, `updatedAt`, `completedAt \| null`, `deletedAt \| null` | Задача; владеет переходами статуса и составом участников |
| `TaskAttachment` | new | нет (внутри `Task`-границы, своё хранение) | `id`, `taskId`, `originalName: FileName`, `storageKey`, `sizeBytes`, `contentType`, `uploadedBy`, `createdAt` | Метаданные файла; байты лежат в `FileStorage` |
| `User` (`auth_users`) | existing | — | `id`, `login`, `is_active` | Только читается через `UserDirectory`, в tasks не моделируется |

### Aggregates
| Aggregate | Root entity | Входит в состав | Инварианты |
|---|---|---|---|
| `Task` | `Task` | `TaskTitle`, `TaskStatus`, `watcherIds` | Название 1..200 после trim; описание ≤ 10000; наблюдателей ≤ 50 без повторов; `creatorId` неизменен; `completedAt` задан тогда и только тогда, когда статус `done`; повторная установка `done` не сдвигает `completedAt`; удалённая задача не изменяется |
| `TaskAttachment` | `TaskAttachment` | `FileName` | Привязано к одной задаче; число вложений задачи ≤ лимита (проверяет use-case в рамках транзакции); `storageKey` уникален |

### Value Objects
| Name | Поля | Почему VO |
|---|---|---|
| `TaskTitle` | `value` | Нормализация (trim) и проверка длины при создании |
| `TaskStatus` | `'todo' \| 'in_progress' \| 'done'` | Закрытое множество значений |
| `FileName` | `value` | Очистка от путевых разделителей и управляющих символов, ограничение 255 символов |
| `TaskFilter` | `status?`, `creatorId?`, `assigneeId?`, `watcherId?`, `overdue?`, `titleContains?` | Неизменяемый набор условий списка |
| `TaskSort` | `field: 'deadline' \| 'createdAt' \| 'updatedAt'`, `direction` | Белый список полей сортировки |
| `Actor` | `userId` | Субъект действия для `TaskAccessPolicy` |

### Services
| Service | Слой | Ответственность |
|---|---|---|
| `CreateTaskUseCase` | application | Проверка участников, создание задачи, создатель из `Actor` |
| `GetTaskUseCase` | application | Задача с участниками и метаданными вложений |
| `ListTasksUseCase` | application | Страница задач по фильтру, сортировке и пагинации |
| `UpdateTaskUseCase` | application | Частичное изменение, замена наблюдателей, смена статуса |
| `DeleteTaskUseCase` | application | Мягкое удаление |
| `UploadAttachmentUseCase` | application | Проверка задачи и лимита, запись файла, запись метаданных, компенсация при сбое |
| `DownloadAttachmentUseCase` | application | Метаданные и поток файла в рамках своей задачи |
| `DeleteAttachmentUseCase` | application | Удаление записи и файла |
| Порты `TaskRepository`, `TaskAttachmentRepository`, `UserDirectory`, `FileStorage`, `TaskAccessPolicy`, `TasksSettings`, `Clock` | domain/ports | Границы с инфраструктурой |
| `SlonikTaskRepository`, `SlonikTaskAttachmentRepository` | infrastructure | Хранение и список с фильтрами в PostgreSQL |
| `SlonikUserDirectory` | infrastructure | `findActiveByIds` по `auth_users` |
| `LocalDiskFileStorage` | infrastructure | Потоковая запись, чтение и удаление под ключом `<uuid>` |
| `AllowAllTaskAccessPolicy` | infrastructure | Текущая политика «разрешено всем», точка замены под роли |
| `EnvTasksSettings` | infrastructure | `TASKS_STORAGE_DIR`, лимиты размера и числа файлов |
| `TasksController` | interface/http | `POST/GET /tasks`, `GET/PATCH/DELETE /tasks/:id` |
| `TaskAttachmentsController` | interface/http | `POST /tasks/:id/attachments`, `GET/DELETE /tasks/:id/attachments/:attachmentId` |
| `tasks.schemas.ts`, `task.response.ts` | interface/http | zod-схемы запросов, форма ответов, OpenAPI |
| `registerTaskErrorStatuses` | interface | Коды ошибок задач → HTTP-статусы |

### Method Signatures (ключевые)
| Service.Method | Params | Returns | Описание |
|---|---|---|---|
| `CreateTaskUseCase.execute` | `actor: Actor, input: { title, description?, deadline?, assigneeId?, watcherIds? }` | `TaskView` | Ошибка `TaskUserNotFound` при неактивном участнике |
| `GetTaskUseCase.execute` | `actor: Actor, id: string` | `TaskView` | `TaskNotFound`, если нет или удалена |
| `ListTasksUseCase.execute` | `actor: Actor, filter: TaskFilter, sort: TaskSort, page: PaginationQuery` | `{ items: TaskSummary[], total, limit, page }` | Удалённые не входят |
| `UpdateTaskUseCase.execute` | `actor: Actor, id: string, patch: TaskPatch` | `TaskView` | Пустой patch отклоняется на уровне схемы |
| `DeleteTaskUseCase.execute` | `actor: Actor, id: string` | `void` | Устанавливает `deletedAt` |
| `UploadAttachmentUseCase.execute` | `actor: Actor, taskId: string, file: { name, contentType, stream }` | `AttachmentView` | Ошибки `AttachmentLimitReached`, `AttachmentTooLarge` |
| `DownloadAttachmentUseCase.execute` | `actor: Actor, taskId: string, attachmentId: string` | `{ meta: AttachmentView, stream }` | `AttachmentNotFound`, в том числе при потерянном файле |
| `DeleteAttachmentUseCase.execute` | `actor: Actor, taskId: string, attachmentId: string` | `void` | Сначала запись в БД, затем файл |
| `Task.changeStatus` | `status: TaskStatus, now: Date` | `void` | Управляет `completedAt` |
| `Task.replaceWatchers` | `ids: string[]` | `void` | Дедупликация, ≤ 50 |
| `FileStorage.save` | `stream, { maxBytes }` | `{ storageKey, sizeBytes }` | Удаляет частичный файл при превышении лимита |
| `TaskAccessPolicy.canUpdate` | `actor: Actor, task: Task` | `boolean` | Сейчас всегда `true` |

---

## Frontend — UI Model
Не применимо: в change нет клиентской части. Страницы, features, hooks и UI-компоненты отсутствуют.

---

## Diagrams
Диаграммы на Miro-доске **ещё не созданы**: создание доски во внешнем сервисе выполняется после вашего согласия (см. вопрос ниже). Ниже схемы в текстовом виде для согласования.

### 1. Domain Entity Interaction
```
 auth_users (existing)
   ▲ creator_id (NOT NULL)   ▲ assignee_id (NULL)   ▲ user_id (N)      ▲ uploaded_by
   │                         │                      │                  │
┌──┴─────────────────────────┴──┐ 1        N ┌──────┴───────┐   ┌──────┴─────────┐
│ Task (aggregate root)         │────────────│ task_watcher │   │ TaskAttachment │
│ title, description, status,   │            └──────────────┘   │ originalName   │
│ deadline, completedAt,        │ 1                          N  │ storageKey ────┼──► FileStorage (диск)
│ deletedAt                     │─────────────────────────────► │ sizeBytes      │
└───────────────────────────────┘                               └────────────────┘
```
Miro link: не создавалась (согласовано текстовое представление)

### 2. External Modules Interaction
```
 HTTP-клиент ──Bearer──► JwtAuthGuard (auth) ──► TasksController
                                                     │ Actor из @CurrentUser()
                                                     ▼
                                              Use cases (tasks)
                          ┌──────────────┬───────────┴────────────┬────────────────┐
                          ▼              ▼                        ▼                ▼
                   TaskRepository  UserDirectory           FileStorage    TaskAccessPolicy
                   (PostgreSQL)    (читает auth_users)     (локальный диск) (allow-all)
```
Вызовы синхронные, внешних систем (CRM, Bitrix24, Miro) нет.
Miro link: не создавалась (согласовано текстовое представление)

### 3. Layer Interaction — от Controller до Response
```
POST /tasks/:id/attachments (multipart)
 → JwtAuthGuard → TaskAttachmentsController (multer, лимит размера)
 → UploadAttachmentUseCase
     1. TaskRepository.findById        ── нет/удалена → TaskNotFound (404)
     2. AttachmentRepository.count     ── ≥ лимита   → AttachmentLimitReached (422)
     3. FileStorage.save(stream)       ── > лимита   → AttachmentTooLarge (413), файл удалён
     4. AttachmentRepository.insert    ── сбой       → FileStorage.delete (компенсация), 500
 → AttachmentView → 201
Ошибки домена → HttpExceptionFilter (registerErrorStatuses) → ApiErrorResponse
```
Miro link: не создавалась (согласовано текстовое представление)

---

## Confirmation Checklist
- [x] Названия entity/aggregate/VO согласованы
- [x] Названия и сигнатуры ключевых методов сервисов согласованы
- [x] Слои фронта: не применимо (backend-only)
- [x] Диаграммы (текстовые схемы; Miro не требуется по решению пользователя)
- [x] Пользователь подтвердил переход к tasks.md
