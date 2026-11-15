## Context

Мотивация — в proposal.md (Why), требования — в `specs/`. Ниже только то, что влияет на реализацию.

- Change опирается на Э2–Э4, все в архиве, спеки синхронизированы. Последняя миграция — 036 (`portal_request_comments`).
- Модуль `backend/src/modules/portal` устроен по слоям `domain / application / infrastructure / interface / contracts`. Заявка — агрегат `IdeaRequest`, конкурентные решения защищены условным `UPDATE … WHERE decision = expected` (Э3). Read-модели читают ФИО через JOIN `auth_user_profiles` по правилам `employee-directory`. Пагинация — `PageRequest`/`Page<T>` и `paginationQuerySchema`.
- Комментарии Э4: `RequestComment`, `CommentBody` (1–4000, trim), `COMMENT_EDIT_WINDOW_MS`, `commentExcerpt`, `RequestAccessPolicy`, три use-case'а, `CommentsController` на `portal/requests/:id/comments`. Пользователь выбрал отдельную ленту для багов: таблица и код Э4 не меняются, а VO, константы и чистые функции Э4 переиспользуются как есть.
- Каталог: агент в нескольких продуктах (`portal_agent_products`), архив агента — `archived_at`. Агентов и продукты для формы портал уже получает из `GET /portal/catalog` (архивные там скрыты).
- `notifications`: подписчик → правило → `CreateNotificationsUseCase`, дедупликация по `(source_event_id, recipient_id, type, target_id)`. `UserDirectoryPort.listActiveDeveloperIds()` и `findFullNameById()` уже есть (Э4). Цели — `task | chat | request`.
- Telegram: `notificationMessage(notification, portalUrl)` добавляет ссылку только для `request`; `PORTAL_PUBLIC_URL` уже в конфигурации.
- control-center и manager-helper разбирают цель как `{ type: string, id }`: неизвестный тип не ломает разбор, по клику уведомление только отмечается прочитанным.
- Портал: фича `comments` (Э4) жёстко зовёт `/portal/requests/:id/comments` и знает роль `request_author`. Страницы связывают фичи слотами, фичи друг друга не импортируют.

## Goals / Non-Goals

**Goals:**
- Баг — самостоятельный агрегат со своей политикой переходов, без связи с заявкой и навыком.
- Лента комментариев бага повторяет поведение Э4 и переиспользует его доменные правила, не трогая таблицу и use-case'ы заявок.
- Один компонент ленты в портале для заявки и бага.
- Уведомления и ссылка в Telegram — через существующие механизмы.

**Non-Goals:**
- Открытие бага по уведомлению из control-center и manager-helper.
- Вложения и скриншоты, приоритет, назначение конкретному разработчику, SLA, история статусов, связь бага с навыком или заявкой, поиск дублей.
- Публичный список багов агента для всех сотрудников.
- Общий «тред» комментариев для заявок и багов на бэкенде.

## Decisions

### 1. Хранение — миграция 037

```
portal_bugs (
  id                 UUID PRIMARY KEY,
  author_id          UUID NOT NULL REFERENCES auth_users(id),
  product_id         UUID NOT NULL REFERENCES portal_products(id),
  agent_id           UUID NOT NULL REFERENCES portal_agents(id),
  title              TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  description        TEXT NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 4000),
  status             TEXT NOT NULL CHECK (status IN ('open','in_progress','resolved','wont_fix')),
  wont_fix_reason    TEXT NULL CHECK (wont_fix_reason IS NULL OR char_length(wont_fix_reason) BETWEEN 1 AND 2000),
  status_changed_by  UUID NULL REFERENCES auth_users(id),
  created_at         TIMESTAMPTZ NOT NULL,
  status_changed_at  TIMESTAMPTZ NOT NULL,
  CHECK ((status = 'wont_fix') = (wont_fix_reason IS NOT NULL))
)
INDEX portal_bugs_author_idx ON (author_id, created_at DESC, id)
INDEX portal_bugs_status_idx ON (status, created_at, id)

portal_bug_comments (
  id, bug_id UUID NOT NULL REFERENCES portal_bugs(id) ON DELETE CASCADE,
  author_id, body, created_at, edited_at   -- как portal_request_comments
)
INDEX portal_bug_comments_bug_idx ON (bug_id, created_at, id)
```

- Пара (продукт, агент) проверяется в use-case'е, а не внешним ключом на `portal_agent_products`: связь агента с продуктом в будущем может исчезнуть, а баг должен остаться.
- `created_at` и `status_changed_at` пишет приложение из `Clock`, как в Э4.
- *Почему не `portal_requests` с `kind`:* решение пользователя — отдельная сущность; у идеи и бага разные поля и жизненные циклы, статус идеи выводится из навыка, а статус бага хранится.

### 2. Домен бага

- `BugStatus` (`domain/bug-status.ts`): `BUG_STATUSES`, таблица `BUG_TRANSITIONS`, `BugStatusPolicy.nextStatuses(status)` и `canTransition(from, to)`. Таблица — единственный источник: ею пользуются агрегат и поле `nextStatuses` ответа.
- `BugTitle` (≤ 200), `BugDescription` (≤ 4000, переносы сохраняются), `WontFixReason` (≤ 2000) — VO с trim и `ArgumentInvalidError` → 400.
- `BugReport` (`domain/bug-report.ts`): `report({ id, authorId, productId, agentId, title, description, now })` → `open`. `changeStatus(to, by, reason: WontFixReason | null, now)`: недопустимый переход → `InvalidBugTransitionError` (`PORTAL_BUG_INVALID_TRANSITION` → 409); `to = wont_fix` без причины → `ArgumentInvalidError`; иначе меняет статус, `statusChangedBy`, `statusChangedAt`, причину (только для `wont_fix`, иначе `null`). Возвращает прежний статус для события.
- `BugAccessPolicy.canView({ authorId }, actor)` — та же формула, что `RequestAccessPolicy`. Отдельный объект, а не переиспользование: правила доступа к багу могут разойтись с заявками (например, публичные баги агента).
- Ошибки в `domain/errors.ts`: `BugNotFoundError` (`PORTAL_BUG_NOT_FOUND` → 404), `InvalidBugTransitionError` (409), `AgentNotInProductError` (`PORTAL_AGENT_NOT_IN_PRODUCT` → 400). Архивный агент — существующая `AgentArchivedError` (409), неизвестные — `AgentNotFoundError` / `ProductNotFoundError` (404).

### 3. Конкурентная смена статуса

`BugRepository.updateStatus(bug, expectedStatus)` выполняет `UPDATE portal_bugs SET … WHERE id = $1 AND status = $expected` и возвращает `false`, если строка не обновилась. Use-case в транзакции читает баг, вызывает `changeStatus` (проверка перехода по прочитанному статусу) и пишет условно. `false` → `InvalidBugTransitionError` (409). Так второй из двух одновременных запросов получает 409 без блокировок, как решения по заявкам в Э3.

### 4. Use-case'ы и API

| Метод | Use-case | Роль | Ответ |
|---|---|---|---|
| `POST /portal/bugs` `{ title, description, productId, agentId }` | `ReportBugUseCase` | любой | 201 `BugResponse` |
| `GET /portal/bugs/my?page&limit` | `ListMyBugsUseCase` | любой | 200 `{ items: BugListItem[], total }` |
| `GET /portal/bugs/queue?status&page&limit` | `ListBugQueueUseCase` | `developer` | 200 `{ items, total }` |
| `GET /portal/bugs/:id` | `GetBugUseCase` | автор или `developer` | 200 `BugResponse` |
| `POST /portal/bugs/:id/status` `{ status, reason? }` | `ChangeBugStatusUseCase` | `developer` | 200 `BugResponse` |
| `GET`/`POST /portal/bugs/:id/comments` | `ListBugCommentsUseCase`, `PostBugCommentUseCase` | автор или `developer` | 200 / 201 |
| `PATCH /portal/bugs/:id/comments/:commentId` | `EditBugCommentUseCase` | автор комментария | 200 |

```
BugResponse = {
  id, title, description,
  product: { id, name }, agent: { id, name },
  author: { id, login, fullName },
  status, createdAt, statusChangedAt,
  statusChangedBy: { id, login, fullName } | null,
  wontFixReason: string | null,
  nextStatuses: BugStatus[]          // [] для не-разработчика
}
BugListItem = { id, title, product, agent, status, createdAt, statusChangedAt, author: { id, login, fullName } }
```

- `GET /portal/bugs/my` и `/queue` объявляются в контроллере до `/:id`, чтобы не попасть в параметр.
- Очередь: `status` не задан → `WHERE status IN ('open','in_progress') ORDER BY (status = 'in_progress'), created_at, id`; `open`/`in_progress` → `ORDER BY created_at, id`; `resolved`/`wont_fix` → `ORDER BY status_changed_at DESC, id`. Фильтр — `z.enum(BUG_STATUSES).optional()`.
- `ReportBugUseCase`, в транзакции: существующий `CatalogRepository.findAgentForShare(agentId)` (нет → 404, `archivedAt` → 409; `FOR SHARE` не даёт архивировать агента до коммита) и `findProductsByIds([productId])` (нет → 404), членство — `agent.productIds.includes(productId)` (нет → 400) → VO → `BugReport.report` → `BugRepository.insert` → `publish(BugReportedEvent)` с названиями продукта и агента. После коммита — `BugQuery.findView`. Новых методов в репозитории каталога не нужно.
- `nextStatuses` вычисляет use-case: `roles.includes('developer') ? BugStatusPolicy.nextStatuses(status) : []`.
- Zod-схемы сырого ввода с верхними границами (`title ≤ 1000`, `description ≤ 20000`, `reason ≤ 10000`), смысловые правила — в VO.
- Лента: `BugComment` повторяет `RequestComment` (create/restore/canEdit/edit с `CommentBody` и `COMMENT_EDIT_WINDOW_MS`), ошибки комментариев Э4 (`CommentNotFoundError`, `CommentNotOwnedError`, `CommentEditWindowExpiredError`) переиспользуются с теми же кодами. `authorRole: 'bug_author' | 'developer'`. Формат ответа — `CommentResponse` Э4 с другим значением роли.
  - *Почему копия агрегата, а не общий `Comment`:* так решил пользователь — код Э4 не трогаем. Общая часть (VO, константы, ошибки, `commentExcerpt`) уже вынесена и переиспользуется, дублируется только класс на ~60 строк и use-case'ы.

### 5. События

В `portal/contracts`, регистрация в `register-portal-events.ts`:

- `BugReportedEvent` (`portal.bug_reported`, `aggregateId` = id бага): `{ bugId, authorId, title, productName, agentName }`.
- `BugStatusChangedEvent` (`portal.bug_status_changed`): `{ bugId, authorId, changedBy, title, from, to, reason }`.
- `BugCommentPostedEvent` (`portal.bug_comment_posted`, `aggregateId` = id комментария): `{ bugId, bugAuthorId, commenterId, bugTitle, excerpt }`, `excerpt = commentExcerpt(body)`.
- `BUG_STATUS_LABELS` (`contracts/bug-status-labels.ts`): «Открыт», «В работе», «Исправлен», «Не будет исправлен» — для текста уведомления, по образцу `skill-status-labels.ts`.

### 6. Уведомления

- `NOTIFICATION_TARGET_TYPES` + `bug`; `NOTIFICATION_TYPES` + `bug.reported`, `bug.status-changed`, `bug.comment-added`.
- `BugReportedRule.apply(event, authorName, developerIds)` → черновики всем `developerIds \ {authorId}`: «Новый баг: {title}», «{authorName} · {productName} · {agentName}».
- `BugStatusChangedRule.apply(event, developerName)` → `[]`, если `changedBy === authorId`, иначе автору: «Баг «{title}»: {label(to)}», текст «{developerName} сменил статус» + `\nПричина: {reason}` для `wont_fix`.
- `BugCommentRule` — по образцу `RequestCommentRule`: `recipients(event, developerIds)` и `apply(...)`, заголовок «Новый комментарий к багу: {bugTitle}».
- Три подписчика по образцу `RequestCommentPostedSubscriber`: имя инициатора через `findFullNameById` (`null` → `NotificationActorNotFoundError`), разработчики через `listActiveDeveloperIds` только там, где они нужны. Регистрация в `notification-event-subscriptions.ts`.

### 7. Telegram

`telegram/domain/portal-bug-url.ts`: `portalBugUrl(base, id)` → `{base}/bugs/{encodeURIComponent(id)}`. `notificationMessage`: таблица `{ request: [portalRequestUrl, 'Открыть заявку'], bug: [portalBugUrl, 'Открыть обращение'] }` вместо одного `if`; для остальных целей и без `portalUrl` сообщение прежнее.

### 8. Портал

- **Фича `bugs`** (`features/bugs/`): `model/bugs.api.ts` (`reportBug`, `listMyBugs`, `listBugQueue`, `getBug`, `changeBugStatus`), `bugs.schema.ts` (Zod `BugResponse`, `BugListItem`, `BugStatus`), `bugs.queries.ts` (`myBugsQuery(page)`, `bugQueueQuery(filter, page)`, `bugQuery(id)`), `use-report-bug.ts`, `use-change-bug-status.ts`, `bugs.errors.ts` (сообщения по `code`), `bug-presentation.ts` (подписи статусов и тон бейджа), `bug-form.ts` (чистая логика формы: агенты выбранного продукта, сброс агента при смене продукта, предвыбор по `agentId`). `ui/`: `BugForm`, `BugList` (для «Моих» и очереди, колонка автора по флагу), `BugQueueFilter`, `BugDetails` (со слотами `actions` и `comments`), `BugStatusBadge`, `BugStatusActions`, `WontFixDialog`.
- **Страницы:** `NewBugPage` (`/bugs/new?agentId=`; каталог берёт через существующий `use-catalog.ts` и передаёт продукты в `BugForm`), `MyBugsPage` (`/bugs`), `BugQueuePage` (`/bugs/queue`, под `RequireRole developer`), `BugPage` (`/bugs/:id`, связывает `BugDetails`, `BugStatusActions` и `CommentsSection`). Маршруты `/bugs/new` и `/bugs/queue` объявляются до `/bugs/:id`.
- **Лента:** `CommentsSection` получает `subject: 'requests' | 'bugs'` (по умолчанию `'requests'` для обратной совместимости). API строит путь `/portal/${subject}/${id}/comments`, ключ кеша включает `subject`. Схема роли — `z.enum(['request_author', 'bug_author', 'developer'])`, подписи: «Автор заявки», «Автор обращения», «Разработчик». Проп `requestId` переименовывается в `subjectId`, `RequestPage` обновляется.
  - *Почему одна фича, а не копия:* поведение ленты по спеке одинаковое, а копия UI на четыре компонента удвоила бы тесты и вёрстку. Отдельность бэкенда это не нарушает: портал видит два эндпоинта одного формата.
- **Меню:** `NavMenu` — «Поддержка» (`/bugs`) в общей группе после «Роадмап», «Баги» (`/bugs/queue`) в группе разработчика после «Навыки». Активный пункт «Поддержка» не подсвечивается на `/bugs/queue`.
- **Карточка агента:** `AgentPage` кладёт `<Link to={`/bugs/new?agentId=${id}`}>Сообщить о проблеме</Link>` (вид `Button outline`) в слот `actions` карточки рядом с `ArchiveAgentAction`. Слот уже есть, фича `catalog` не меняется.
- 409 при смене статуса → сообщение «Статус бага уже изменился» и инвалидирование `bugQuery`. 409 при подаче → сообщение и инвалидирование каталога.

## Risks / Trade-offs

- [Код ленты бага дублирует ленту заявки на бэкенде; правило поменяют в одном месте и забудут в другом] → общие правила (длина, окно, обрезка, ошибки) живут в одном месте и импортируются обоими агрегатами; дублируются только оркестрация и SQL. Сценарии спеки двух лент совпадают и покрываются тестами.
- [Каждый новый баг уведомляет всех разработчиков] → разработчиков единицы; правило изолировано в `BugReportedRule`.
- [Переход по уведомлению о баге в control-center и manager-helper ничего не открывает] → сообщение в Telegram содержит ссылку, в портале есть «Поддержка» и «Баги». Доработка клиентов — отдельный change.
- [Агента архивируют, пока сотрудник заполняет форму] → сервер отвечает 409, портал объясняет и обновляет список.
- [Переименование пропа `CommentsSection` затрагивает экран заявки Э4] → правка механическая, покрывается существующими тестами `RequestPage` и `CommentsSection`.

## Migration Plan

1. Миграция 037 создаёт `portal_bugs`, `portal_bug_comments` и индексы. Данных для переноса нет.
2. Бэкенд и портал выкатываются вместе; новые типы событий регистрируются при старте модуля до outbox-воркера.
3. Откат: `DROP TABLE portal_bug_comments; DROP TABLE portal_bugs;`, невыданные события `portal.bug_*` пометить обработанными. Уведомления `bug.*` остаются в истории, переход по ссылке в Telegram покажет «Обращение не найдено».
