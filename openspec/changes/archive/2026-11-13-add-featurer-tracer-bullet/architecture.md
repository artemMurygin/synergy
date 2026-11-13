# Architecture: add-featurer-tracer-bullet

## Scope
Изменение затрагивает:
- **бэкенд:** новый модуль `portal` (каталог, навыки, заявки, API, seed, события); `auth` (роли в токене и профиле, `RolesGuard`, роли в сидере); `notifications` (тип объекта `request`, два подписчика, правка уникального индекса);
- **новое веб-приложение `portal/`** (портал сотрудника и разработчика);
- **клиенты уведомлений:** `control-center` (Electron) и `manager-helper` (расширение) — только обработка клика по уведомлению `request` (открыть портал в браузере).

Telegram-модуль не меняется: доставка идёт по общему конвейеру.

---

## Backend — Domain Model

Слои и стиль — как в `tasks`: `domain` (агрегаты, VO, порты-абстрактные классы) → `application` (use case'ы) → `infrastructure` (Slonik) → `interface` (HTTP, zod-схемы). События — в `portal/contracts`.

### Entities
| Name | Status (new/existing) | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `Product` (portal) | new | да | `id`, `slug`, `name` | Продукт каталога. В Э0 только из seed, без поведения |
| `Agent` (portal) | new | да | `id`, `productId`, `slug`, `name` | Агент продукта. В Э0 только из seed |
| `Skill` (portal) | new | да | `id`, `agentId`, `name: SkillName`, `description`, `status: SkillStatus`, `createdAt`, `statusChangedAt` | Навык агента, единица, к которой привязываются заявки |
| `IdeaRequest` (portal) | new | да | `id`, `authorId`, `title: RequestTitle`, `description`, `frequency: Frequency`, `minutesPerRun`, `peopleCount`, `decision: RequestDecision`, `createdAt` | Заявка на автоматизацию. Статуса «для автора» не хранит |
| `AuthUser` (auth) | existing, меняется | да | + `roles: Role[]` | Пользователь получает набор ролей, читается при входе и обновлении |
| `AccessClaims` (auth) | existing, меняется | — | + `rol: Role[]` | Роли в access-токене |
| `Notification` (notifications) | existing, меняется | да | без новых полей | Новые типы `request.accepted`, `request.rejected`, `request.status-changed`, тип объекта `request` |

Имя `IdeaRequest`, а не `Request`, чтобы не пересекаться с HTTP-типом `Request` из Express.

### Aggregates
| Aggregate | Root entity | Входит в состав (entities/VO) | Инварианты, которые защищает |
|---|---|---|---|
| `Skill` | `Skill` | `SkillName`, `SkillStatus` | Новый навык всегда `planned`. Переход только на соседний статус вперёд; повтор, пропуск, возврат и выход из `launched` отклоняются. `statusChangedAt` обновляется при каждой смене |
| `IdeaRequest` | `IdeaRequest` | `RequestTitle`, `Frequency`, `RequestDecision`, `RejectReason` | Поля анкеты валидны (названия не пустые, числа целые и больше нуля). Решение принимается только из `pending`; принятая заявка всегда ссылается на навык, отклонённая всегда имеет причину |
| `Product`, `Agent` | свои | — | Уникальный `slug`. Изменяются только сидером |

### Value Objects
| Name | Поля | Почему VO (immutable/self-validating) |
|---|---|---|
| `Role` (auth) | `'developer'` | Закрытое множество; неизвестное значение отвергается при чтении и сидировании |
| `SkillStatus` (portal) | `'planned' \| 'in_dev' \| 'testing' \| 'launched'` | Закрытое множество. `next()` даёт соседний статус или `null`, `canAdvanceTo(to)` — единственное место правила переходов |
| `SkillName` (portal) | `value: string` | Самопроверка: непустое после обрезки пробелов, не длиннее предела |
| `RequestTitle` (portal) | `value: string` | То же для названия заявки |
| `Frequency` (portal) | `count: number`, `period: 'day' \| 'week' \| 'month'` | Самопроверка: целое больше нуля, период из списка |
| `RejectReason` (portal) | `value: string` | Самопроверка: непустая после обрезки пробелов |
| `RequestDecision` (portal) | `pending` \| `accepted{skillId, decidedBy, decidedAt}` \| `rejected{reason, decidedBy, decidedAt}` | Размеченное объединение: невозможно собрать «принято без навыка» |
| `RequestStatus` (portal, derived) | `'pending' \| 'rejected' \| SkillStatus` + русская метка | Результат чтения: решение плюс статус навыка. Единый словарь меток для API и уведомлений в `portal/contracts` |
| `LinkedRequestSnapshot` (contracts) | `requestId`, `authorId`, `title` | Строка снимка привязанных заявок внутри события |
| `RequestAccepted` (contracts, событие) | `requestId`, `authorId`, `decidedBy`, `skillId`, `skillName`, `skillStatus` | Событие принятия |
| `RequestRejected` (contracts, событие) | `requestId`, `authorId`, `decidedBy`, `reason`, `requestTitle` | Событие отклонения |
| `SkillStatusChanged` (contracts, событие) | `skillId`, `skillName`, `from`, `to`, `changedBy`, `linked: LinkedRequestSnapshot[]` | Событие смены статуса навыка со снимком заявок |
| `SkillView`, `RequestView` (application) | поля для ответа API + `RequestStatus` | Read-модели; заявка читается через JOIN с навыком, не через агрегат |

### Services
| Service | Слой (application/domain/infrastructure) | Ответственность |
|---|---|---|
| `SubmitRequestUseCase` | application | Создать заявку от имени автора по токену |
| `ListMyRequestsUseCase`, `GetRequestUseCase` | application | Чтение своих заявок и заявки по id; разработчику доступна любая; чужая для остальных — 404 |
| `ListQueueUseCase` | application | Очередь заявок без решения (`developer`) |
| `AcceptRequestUseCase` | application | Принять в существующий навык или создать навык и привязать, в одной транзакции; записать `RequestAccepted` |
| `RejectRequestUseCase` | application | Отклонить с причиной, записать `RequestRejected` |
| `ListAgentsUseCase` | application | Агенты с продуктами для выбора |
| `CreateSkillUseCase`, `ListSkillsUseCase` | application | Создать навык; список с фильтром по статусу и числом заявок (`developer`) |
| `ChangeSkillStatusUseCase` | application | Перевести навык на следующий статус под блокировкой строки, записать `SkillStatusChanged` со снимком заявок |
| `SeedPortalCatalogUseCase` | application | Идемпотентно завести продукты и агентов (CLI `seed:portal`) |
| `RequestStatusPolicy` | domain | Чистая функция: решение заявки и статус навыка → `RequestStatus` |
| `RequestRepository`, `RequestQuery`, `SkillRepository`, `CatalogRepository` | domain (порты) / infrastructure (Slonik) | Запись агрегатов; чтение read-моделей с JOIN; чтение каталога и seed |
| `RolesGuard` + `@Roles()` | auth interface | Проверка ролей по claims токена; 401 раньше 403 |
| `RequestDecidedSubscriber` | notifications application | Из `RequestAccepted` и `RequestRejected` строит уведомление автору |
| `SkillStatusChangedSubscriber` | notifications application | Из `SkillStatusChanged` строит по уведомлению на каждую заявку из снимка |
| `RequestDecisionRule`, `SkillStatusChangedRule` | notifications domain | Правила: кому, какой тип и текст, пропуск при совпадении автора и разработчика |

### Method Signatures (ключевые, по каждому сервису)
| Service.Method | Params | Returns | Краткое описание |
|---|---|---|---|
| `SkillStatus.canAdvanceTo` | `to: SkillStatus` | `boolean` | Только соседний вперёд |
| `Skill.advance` | `to: SkillStatus`, `now: Date` | `void` | `InvalidSkillTransitionError` → 409 |
| `IdeaRequest.accept` | `skillId: string`, `by: string`, `now: Date` | `void` | `RequestAlreadyDecidedError` → 409 |
| `IdeaRequest.reject` | `reason: string`, `by: string`, `now: Date` | `void` | `InvalidRejectReasonError` → 400, `RequestAlreadyDecidedError` → 409 |
| `RequestStatusPolicy.statusOf` | `decision: RequestDecision`, `skillStatus: SkillStatus \| null` | `RequestStatus` | Единственное место правила вывода статуса |
| `SubmitRequestUseCase.execute` | `{ authorId, title, description, frequency, minutesPerRun, peopleCount }` | `Promise<RequestView>` | 201; недопустимые значения → 400 |
| `ListMyRequestsUseCase.execute` | `{ authorId, limit, page }` | `Promise<{ items: RequestView[]; total: number }>` | Новые первыми |
| `GetRequestUseCase.execute` | `{ actorId, roles, requestId }` | `Promise<RequestView>` | Автор или `developer`; иначе `RequestNotFoundError` → 404 |
| `ListQueueUseCase.execute` | `{ limit, page }` | `Promise<{ items: RequestView[]; total: number }>` | Старые первыми, только `pending` |
| `AcceptRequestUseCase.execute` | `{ requestId, decidedBy, target: { skillId } \| { agentId, name, description } }` | `Promise<RequestView>` | Одна транзакция; `SkillNotFoundError`, `AgentNotFoundError` → 404; повтор → 409 |
| `RejectRequestUseCase.execute` | `{ requestId, decidedBy, reason }` | `Promise<RequestView>` | 400 без причины, 409 при повторе |
| `CreateSkillUseCase.execute` | `{ agentId, name, description }` | `Promise<SkillView>` | Статус `planned`; несуществующий агент → 404 |
| `ChangeSkillStatusUseCase.execute` | `{ skillId, to, changedBy }` | `Promise<SkillView>` | Блокировка строки навыка, снимок заявок, событие; 409 при недопустимом переходе |
| `ListSkillsUseCase.execute` | `{ status?, limit, page }` | `Promise<{ items: SkillView[]; total: number }>` | С числом привязанных заявок |
| `RequestRepository.save` | `request: IdeaRequest` | `Promise<void>` | Условное обновление `WHERE decision = 'pending'` для решения |
| `RequestRepository.listLinkedToSkill` | `skillId: string` | `Promise<LinkedRequestSnapshot[]>` | В той же транзакции, что смена статуса |
| `SkillRepository.findForUpdate` | `id: string` | `Promise<Skill \| null>` | `SELECT … FOR UPDATE` |
| `RequestQuery.listByAuthor` | `authorId`, `{limit, page}` | `Promise<{ items: RequestView[]; total: number }>` | JOIN с навыком, статус выводится политикой |
| `RequestQuery.listPending` | `{limit, page}` | `Promise<{ items: RequestView[]; total: number }>` | Для очереди |
| `RolesGuard.canActivate` | `context: ExecutionContext` | `boolean` | Роли из claims; нет роли → `ForbiddenError` → 403 |
| `LoginUseCase.execute`, `RefreshSessionUseCase.execute` | как сейчас | как сейчас + `rol` в токене | Роли читаются из БД при выдаче токена |
| `SeedUsersUseCase.execute` | список `{ login, password?, roles? }` | как сейчас | Неизвестная роль → ошибка запуска, повтор идемпотентен |
| `RequestDecisionRule.apply` | `event: RequestAccepted \| RequestRejected`, `actorLogin: string` | `NotificationDraft[]` | Пусто, если автор — разработчик |
| `SkillStatusChangedRule.apply` | `event: SkillStatusChanged` | `NotificationDraft[]` | По одному на заявку из снимка, кроме заявок разработчика |

---

## Frontend — UI Model

Фронт — новое приложение `portal/` на стеке `control-center` (Vite, React 19, TanStack Query, zustand, Tailwind 4, zod). `frontend/CLAUDE.md` и FSD в проекте нет; структура повторяет `control-center`: `features/<name>/` (UI и хуки), `lib/` (клиент API, схемы, ошибки), `stores/` (zustand), `layouts/`. Роутер в стеке не упомянут, но прямые ссылки на заявку требуют URL, поэтому добавляется `react-router` как единственная новая зависимость.

Для клиентов уведомлений правки точечные: `control-center/…/features/notifications/use-open-notification.ts` (+ константа `request` в `notifications.schema.ts`, настройка адреса портала) и `manager-helper/src/sidepanel/App.tsx`, `background/notifications/system-notifier.ts` (+ тип цели в `pending-target.ts`).

### Pages
| Page | Route | Структура (ui / +model / +mediator) | Назначение |
|---|---|---|---|
| `LoginPage` | `/login` | ui + model (`useLogin`) | Вход; возвращает на запрошенный адрес |
| `ChangePasswordPage` | `/change-password` | ui + model | Обязательная смена временного пароля |
| `NewIdeaPage` | `/ideas/new` | ui + model (`useSubmitRequest`) | Анкета идеи |
| `MyRequestsPage` | `/requests` | ui + model (`useMyRequests`) | «Мои заявки» |
| `RequestPage` | `/requests/:id` | ui + model (`useRequest`) | Экран заявки; для разработчика с заявкой `pending` показывает панель решения |
| `QueuePage` | `/queue` | ui + model (`useQueue`) | Очередь (`developer`) |
| `SkillsPage` | `/skills` | ui + model (`useSkills`) | Навыки и смена статуса (`developer`) |
| `NotFoundPage` | `*` | ui | Страница не найдена |

### Features (переиспользуемые модули с бизнес-логикой)
| Feature | Статус (new/existing) | Публичный API (index.ts) | model/ (хуки, api.ts) | Назначение |
|---|---|---|---|---|
| `auth` | new | `SessionProvider`, `RequireAuth`, `RequireRole`, `useSession` | `session.store.ts`, `auth.api.ts`, `refresh-coordinator.ts` | Токен в памяти, восстановление по cookie, общий refresh при 401, выход |
| `requests` | new | `RequestForm`, `RequestList`, `RequestDetails`, `RequestStatusBadge` | `requests.api.ts`, `requests.queries.ts`, `requests.schema.ts` | Подача, список и детали заявок |
| `decision` | new | `DecisionPanel` | `decision.api.ts`, `use-accept-request.ts`, `use-reject-request.ts` | Принять в навык или отклонить |
| `skills` | new | `SkillsTable`, `SkillStatusAction`, `SkillPicker` | `skills.api.ts`, `skills.queries.ts`, `catalog.queries.ts` | Навыки, агенты, смена статуса |
| `shell` | new | `AppLayout`, `NavMenu` | — | Навигация по ролям, слоты header/body |

### UI-компоненты (page-local и shared)
| Component | Слой (pages/<Page>/ui · shared/ui-kit · shared/ui legacy) | Props (основные) | Назначение |
|---|---|---|---|
| `RequestForm` | `features/requests` | `onSubmitted` | Поля анкеты, клиентская проверка, сохранение ввода при ошибке |
| `RequestList` | `features/requests` | `items`, `isLoading`, `error`, `onRetry` | Список со статусами, пустое состояние и повтор |
| `RequestStatusBadge` | `features/requests` | `status` | Русская метка статуса |
| `RequestDetails` | `features/requests` | `request` | Анкета, причина отказа, навык |
| `DecisionPanel` | `features/decision` | `request`, `onDecided` | Переключатель «принять / отклонить», форма навыка, причина |
| `SkillPicker` | `features/skills` | `value`, `onChange` | Выбор существующего навыка или создание нового с выбором агента |
| `SkillsTable` | `features/skills` | `items`, `filter`, `onFilterChange` | Таблица навыков и фильтр |
| `SkillStatusAction` | `features/skills` | `skill` | Одна кнопка «следующий статус», скрыта для `launched` |
| `AppLayout` | `layouts/` | именованные слоты `header`, `body` | Каркас с меню |
| `ui/*` (Button, Input, Textarea, Select, Badge, Table, Alert) | `components/ui` | — | Базовые элементы на токенах дизайн-кита |

### Hooks (model)
| Hook | Расположение | Тип (state-хук / query options factory) | Возвращает |
|---|---|---|---|
| `useSession` | `features/auth` | state-хук (zustand) | `{ status, profile, roles, login, logout }` |
| `useLogin` | `features/auth` | mutation | Вход, ошибки «неверные данные» и «сервер недоступен» |
| `refresh-coordinator` | `features/auth` | модуль | Один общий refresh для параллельных запросов |
| `myRequestsQuery(page)` | `features/requests` | query options factory | Страница заявок автора |
| `requestQuery(id)` | `features/requests` | query options factory | Заявка по id; 404 в «Заявка не найдена» |
| `useSubmitRequest` | `features/requests` | mutation | Подача, инвалидирует список |
| `queueQuery(page)` | `features/decision` | query options factory | Очередь |
| `useAcceptRequest`, `useRejectRequest` | `features/decision` | mutation | Решение; 409 → обновление очереди |
| `skillsQuery(filter, page)` | `features/skills` | query options factory | Навыки |
| `agentsQuery` | `features/skills` | query options factory | Агенты с продуктами |
| `useChangeSkillStatus` | `features/skills` | mutation | Смена статуса; 409 → актуальное состояние |

### Паттерны, которые нужно учесть при проектировании
- [x] Публичный API фичи только через `index.ts`
- [x] Запросы к backend — через query options factory (`queryOptions({...})`), не голыми async-функциями
- [x] Ошибки API нормализуются в один тип (`lib/errors.ts`), 401/403/404/409 имеют отдельные тексты в UI
- [x] Для страницы с несколькими stateful-виджетами — `mediator/` (не применимо: страницы простые)
- [x] Layout принимает именованные слоты (`header`/`body`), а не `children`
- [x] Разделение `isInitialLoad` / `isRefreshing` (не применимо: фильтры только у списка навыков, он простой)
- [x] Новые компоненты — в `shared/ui-kit/` (не применимо: такого слоя нет; используется `components/ui`)

---

## Diagrams

Диаграммы — на доске Miro «add-featurer-tracer-bullet».

### 1. Domain Entity Interaction
`IdeaRequest` ссылается на `Skill` только после принятия (`RequestDecision.accepted.skillId`). `Skill` принадлежит `Agent`, `Agent` — `Product`. Статус заявки выводится `RequestStatusPolicy` из решения и статуса навыка. `AuthUser` владеет `Role`, роли попадают в `AccessClaims`. События `RequestAccepted`, `RequestRejected`, `SkillStatusChanged` порождаются агрегатами через use case'ы.

Miro link: https://miro.com/app/board/uXjVEOE6-iE=/?moveToWidget=3458764690348896670

### 2. External Modules Interaction
`portal/` → HTTP API модуля `portal` (с cookie `mh_refresh` через `auth`). `portal` → outbox (в той же транзакции) → `notifications` (подписчики и правила) → realtime и Telegram → `control-center` и `manager-helper`, которые по клику открывают `portal/` в браузере. `portal` зависит от `auth` только через `RolesGuard` и профиль; `notifications` читает логин разработчика из каталога пользователей.

Miro link: https://miro.com/app/board/uXjVEOE6-iE=/?moveToWidget=3458764690348896669

### 3. Layer Interaction — от Controller до Response
1. Подача: `POST /portal/requests` → `JwtAuthGuard` → схема zod → `SubmitRequestUseCase` → `RequestRepository.save` → ответ 201.
2. Принятие с новым навыком: `RolesGuard('developer')` → `AcceptRequestUseCase` → транзакция: создание `Skill`, `IdeaRequest.accept`, условный `UPDATE`, запись `RequestAccepted` в outbox → ответ; ошибки 404/409/400.
3. Смена статуса навыка: `ChangeSkillStatusUseCase` → транзакция: `findForUpdate`, `advance`, снимок `listLinkedToSkill`, `save`, событие `SkillStatusChanged` → ответ; 409 при недопустимом переходе.
4. Уведомление: outbox → подписчик → правило → `CreateNotificationsUseCase` → realtime и Telegram.
5. «Мои заявки»: `RequestQuery.listByAuthor` (JOIN с навыком) → `RequestStatusPolicy` → `RequestView`.

Miro link: https://miro.com/app/board/uXjVEOE6-iE=/?moveToWidget=3458764690348896671

---

## Confirmation Checklist
- [x] Названия entity/aggregate/VO согласованы
- [x] Названия и сигнатуры ключевых методов сервисов согласованы
- [x] Слои (pages/features/kernel/shared), структура model/ui и паттерны фронта согласованы
- [x] Диаграммы взаимодействия отражают ожидаемую реализацию
- [x] Пользователь подтвердил переход к tasks.md
