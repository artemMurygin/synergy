# Architecture: add-tasks-clients

## Scope
Клиентская часть модуля задач в двух независимых пакетах (`control-center`, `manager-helper`) и один небольшой backend-кусок: `GET /users` в модуле `auth`. Серверный модуль `tasks` не меняется. `frontend/CLAUDE.md` и FSD в проекте отсутствуют (клиенты — Electron и расширение), поэтому структура следует существующим соглашениям каждого пакета: `features/<name>` + `lib/backend` + `stores` в control-center, `sidepanel/` + `shared/` в manager-helper.

---

## Backend — Domain Model

### Entities
| Name | Status | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `User` (`auth_users`) | existing | да (модуль auth) | `id`, `login`, `isActive` | Не меняется; читается новым запросом |
| `UserSummary` | new (read-model, не entity) | — | `id`, `login` | Элемент ответа `GET /users`, без хэша и служебных полей |

### Aggregates
Новых агрегатов нет: эндпоинт только читает.

### Value Objects
| Name | Поля | Почему VO |
|---|---|---|
| `UserSearch` | `text: string \| null` (trim, ≤ 200) | Нормализация подстроки поиска и экранирование `%`/`_` в одном месте |

### Services
| Service | Слой | Ответственность |
|---|---|---|
| `ListActiveUsersUseCase` | application (auth) | Страница активных пользователей по поиску |
| Порт `UserRepository` (расширяется методом `searchActive`) | domain/ports (auth) | Контракт чтения |
| Реализация `UserRepository.searchActive` (PostgreSQL) | infrastructure (auth) | `is_active`, `ILIKE`, сортировка по логину, `COUNT` |
| `UsersController` | interface/http (auth) | `GET /users`, zod-схема query, OpenAPI, `UserSummaryResponse` |

### Method Signatures
| Service.Method | Params | Returns | Описание |
|---|---|---|---|
| `ListActiveUsersUseCase.execute` | `search: UserSearch, page: PaginationQuery` | `{ items: UserSummary[], total, limit, page }` | Только активные, по возрастанию логина |
| `UserRepository.searchActive` | `search: UserSearch, limit: number, offset: number` | `{ items: UserSummary[], total: number }` | Постраничный поиск |

---

## Frontend — UI Model

### control-center (renderer)

#### Pages / Layouts
| Элемент | Расположение | Структура | Назначение |
|---|---|---|---|
| `AppShell` | `layouts/AppShell.tsx` | named slots `rail`, `chats`, `tasks`; заменяет `ChatLayout` в `App.tsx` | Рейл + область активного раздела; оба раздела смонтированы, неактивный скрыт |
| `NavRail` | `layouts/NavRail.tsx` | — | Иконки «Чаты»/«Задачи», тема, пользователь |
| `ChatSection` | `features/chat-list` + `features/chat` (existing) | без изменений | Раздел чатов |
| `TasksPage` | `features/tasks/TasksPage.tsx` | toolbar + list + drawer (слоты) | Корень раздела задач |

#### Features
| Feature | Статус | Публичный API (`index.ts`) | Содержимое | Назначение |
|---|---|---|---|---|
| `tasks` | new | `TasksPage` | `TasksPage`, `TaskToolbar`, `TaskList`, `TaskRow`, `TaskDrawer`, `TaskForm`, `CreateTaskDialog`, `UserPicker`, `AttachmentList`, `StatusBadge`, `DeadlineLabel`, `ConfirmDialog` | Весь раздел |
| `chat`, `chat-list` | existing | без изменений | — | — |

#### UI-компоненты
| Component | Props (основные) | Назначение |
|---|---|---|
| `TaskRow` | `task`, `selected`, `onSelect`, `onStatusChange` | Строка списка, быстрая смена статуса |
| `StatusBadge` | `status`, `onChange?` | Иконка + текст; с `onChange` — меню статусов |
| `DeadlineLabel` | `deadline`, `status` | Дата + метка «Просрочено» (текстом) |
| `TaskDrawer` | `taskId`, `onClose` | Просмотр и правка; загрузка деталей, 404 → закрытие |
| `TaskForm` | `initial?`, `onSubmit`, `submitting`, `fieldErrors` | Общая форма создания и правки |
| `UserPicker` | `value`, `onChange`, `multiple`, `max` | Поиск по `GET /users`, выбор «Я» |
| `AttachmentList` | `taskId`, `attachments` | Список, загрузка (drag & drop), скачивание, удаление |
| shadcn-кит (`components/ui`) | — | Добавляются `dialog`, `select`, `badge`, `popover`, `command`, `textarea`, `tooltip`, тост |

#### Stores / Hooks / API
| Элемент | Расположение | Тип | Возвращает / отвечает за |
|---|---|---|---|
| `useUiStore` (+`section`) | `stores/ui.store.ts` | zustand | `section`, `setSection` |
| `useTasksStore` | `stores/tasks.store.ts` | zustand | `view`, `status`, `search`, `sort`, `order`, `page`, `selectedTaskId` + сеттеры |
| `tasks.schema.ts` | `lib/backend/` | zod | `Task`, `TaskDetails`, `TaskPage`, `TaskStatus`, `TaskUser`, `Attachment` |
| `tasks.api.ts` | `lib/backend/` | функции | `listTasks`, `getTask`, `createTask`, `updateTask`, `deleteTask`, `uploadAttachment`, `downloadAttachment`, `deleteAttachment` |
| `users.api.ts` | `lib/backend/` | функция | `searchUsers` |
| `tasks.queries.ts` | `lib/backend/` | query options + мутации | `tasksQuery(filters)`, `taskQuery(id)`, `usersQuery(search)`, `useCreateTask`, `useUpdateTask` (оптимистичный статус), `useDeleteTask`, `useUploadAttachment`, `useDeleteAttachment` |
| `viewToFilter` | `features/tasks/view-filter.ts` | чистая функция | `(view, userId) → фильтры API` |
| `useDebouncedValue` | `lib/` | хук | задержка поиска |
| ошибки | `lib/backend/errors.ts` (+) | классы | `TaskNotFoundError`, `TaskUserNotFoundError`, `AttachmentTooLargeError`, `AttachmentLimitError` |
| прокси | `src/main/cc-api-protocol.ts` | main | `ALLOWED_PREFIXES += /tasks, /users` |

### manager-helper (side panel)

#### Экраны и компоненты
| Элемент | Расположение | Назначение |
|---|---|---|
| `SectionSwitch` | `sidepanel/SectionSwitch.tsx` | Сегмент «Чат / Задачи» в шапке |
| `TasksApp` | `sidepanel/tasks/TasksApp.tsx` | Корень раздела: список ↔ детали |
| `TaskList`, `TaskRow` | `sidepanel/tasks/` | Мои задачи, «ещё», быстрый статус |
| `QuickCreate` | `sidepanel/tasks/QuickCreate.tsx` | Поле названия + дедлайн/ответственный в раскрытии |
| `TaskDetails` | `sidepanel/tasks/TaskDetails.tsx` | Просмотр, правка, вложения (скачивание) |
| `StatusBadge`, `DeadlineLabel`, `UserSearchSelect` | `sidepanel/tasks/` | Те же сущности, что в desktop |
| `TasksSplitView` | `sidepanel/tasks/TasksSplitView.tsx` | Широкая панель (≥ 640 px): список слева, детали справа, подсказка «Выберите задачу» |

#### Hooks / API
| Элемент | Расположение | Тип | Описание |
|---|---|---|---|
| `tasks-api.ts` | `shared/` | функции на `authFetch` | `listTasks`, `getTask`, `createTask`, `updateTask`, `downloadAttachment`, `searchUsers`; типизированные ошибки как в desktop |
| `tasks-view.ts` | `shared/` | чистые функции | `openTasksFilters`, слияние потоков `todo`+`in_progress` по дедлайну |
| `use-tasks.ts` | `sidepanel/tasks/` | state-хук | `{ items, loading, error, reload, loadMore, setStatus }` (оптимистично) |
| `active-section.ts` | `shared/` | `chrome.storage.local` | запоминание раздела |
| `tasks-layout.ts` | `sidepanel/tasks/` | чистая функция | `tasksPaneVisibility(widthPx, selectedId)` → какие столбцы показывать; порог берётся из `panel-layout.ts` |

### Паттерны
- [x] Контракт один, пакеты независимы (zod в desktop, ручные парсеры в extension)
- [x] Серверное состояние в кэше, клиентское в zustand (desktop)
- [x] Слой авторизации общий с чатом, фичи различают только доменные ошибки
- [x] Разделение «первичная загрузка» / «обновление» (`keepPreviousData` / отдельный флаг) — фильтры не схлопывают список
- [x] Публичный API фичи только через `index.ts`
- [x] Новые UI-компоненты используют токены `design/synergy-design-kit.pen`

---

## Diagrams
Решение предыдущего change сохраняется: диаграммы даны текстом, доску Miro создаём только по вашей просьбе. Miro link: не создавалась.

### 1. Domain Entity Interaction
```
 Backend (tasks, existing)            Клиентские модели (в каждом пакете)
 ┌────────────────────────┐   JSON    ┌──────────────────────────────┐
 │ TaskResponse           │ ────────► │ Task { id,title,description, │
 │ TaskDetailsResponse    │           │  status,deadline,creator,    │
 │  └ AttachmentResponse  │           │  assignee,watchers,…times }  │
 │ TaskUserResponse{id,   │           │ TaskDetails = Task +         │
 │   login|null}          │           │  attachments[]               │
 └────────────────────────┘           │ TaskUser { id, login|null }  │
 ┌────────────────────────┐           └──────────────┬───────────────┘
 │ UserSummary{id,login}  │ ──────────────────────── ▼ UserPicker
 │  (new, GET /users)     │
 └────────────────────────┘
 Клиентское состояние (не сущности): view, status, search, sort, page, selectedTaskId
```

### 2. External Modules Interaction
```
 control-center renderer ──cc-api://backend──► main (proxy: +Bearer, /tasks,/users,/threads,/agent) ──► Backend
        │  (add-electron-auth: сессия, подстановка Authorization)
 manager-helper sidepanel ──authFetch (Bearer, общий refresh)────────────────────────────────────────► Backend
 Backend: JwtAuthGuard ─► TasksController / TaskAttachmentsController (existing)
                       └► UsersController → ListActiveUsersUseCase → UserRepository (auth_users)
 Расширение и desktop между собой не взаимодействуют.
```

### 3. Layer Interaction — от действия пользователя до ответа
```
Смена статуса (desktop)
 TaskRow/StatusBadge → useUpdateTask.mutate({id,status})
   onMutate: правка кэша списка и деталей (оптимистично)
   → tasks.api.updateTask → fetch cc-api://backend/tasks/:id (PATCH) → proxy → Backend
   200 → onSettled: invalidate tasksQuery/taskQuery
   404 → TaskNotFoundError → закрыть drawer, убрать из списка
   иная ошибка → onError: откат кэша + тост
Загрузка вложения: AttachmentList → useUploadAttachment → FormData → proxy (stream) → POST /tasks/:id/attachments
   201 → invalidate taskQuery;  413 → AttachmentTooLargeError;  422 → AttachmentLimitError
Выбор участника: UserPicker → debounce 300 мс → usersQuery(search) → GET /users?search&limit
Мои задачи (extension): useTasks → два запроса status=todo / status=in_progress (assigneeId=я, sort=deadline) → слияние по дедлайну
```

---

## Confirmation Checklist
- [ ] Названия сущностей и сигнатуры `GET /users` согласованы
- [ ] Структура компонентов, сторов и хуков в обоих клиентах согласована
- [ ] Диаграммы отражают ожидаемую реализацию
- [ ] Пользователь подтвердил переход к `ui-design.md` и `tasks.md`
