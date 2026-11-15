<!--
  Правила выполнения:
  - Бэкенд: `cd backend`, тесты `npx vitest run <путь>`, типы `npm run typecheck`, линт `npm run lint`.
    Интеграционные тесты БД идут только при заданной `PROGRAMS_ETL_TEST_ADMIN_URL` (иначе пропускаются):
    перед группами 1, 5, 6 убедиться, что переменная задана (admin URL — из POSTGRES_URL в backend/.env с базой /postgres).
  - Портал: `cd portal`, тесты `npx vitest run <путь>`, типы `npm run typecheck`.
  - Последняя миграция — 034; новая — `035_portal_request_review.sql` (сверить `ls backend/db/migrations`).
  - Макеты — `design/synergy-design.pen`, фрейм Portal (`t2DLO`), раздел `17` (`qlzCX`). Node ID — в `frames` групп вёрстки
    и в `ui-design.md`. Фрейм читать через `mcp__pencil__*` (`execute`/`Get`), `.pen` иначе не читать и не править.
  - Модуль бэкенда — `backend/src/modules/portal` (ниже пути относительно него, если не указано иное).
  - Коды ошибок: `PORTAL_REQUEST_ALREADY_TAKEN`, `PORTAL_REQUEST_NOT_TAKEN`, `PORTAL_AGENT_NAME_TAKEN`,
    `PORTAL_PRODUCT_NAME_TAKEN` (все 409), `PORTAL_PRODUCT_NOT_FOUND` (404).
-->

## 1. backend, БД: миграция `035_portal_request_review`
> track: backend
> depends: —
> specs: featurer-requests → «Подача идеи»; featurer-requests → «Взятие заявки в работу»; featurer-requests → «Решение «принять в навык»»; featurer-catalog → «Уникальность названий агентов и продуктов»
> arch: Entities/IdeaRequest; Value Objects/RequestDecision
> files: backend/db/migrations/035_portal_request_review.sql; backend/src/database/postgres/portal-request-review-migration.spec.ts
> frames: —

- [ ] 1.1 TDD: миграция переводит `portal_requests.decision` в набор `new|under_review|accepted|rejected` (существующие `pending` → `new`), добавляет `reviewer_id UUID REFERENCES auth_users`, `taken_at TIMESTAMPTZ`, `effort_hours INTEGER`; заполняет `reviewer_id := decided_by`, `taken_at := decided_at` у решённых; CHECK: `(decision = 'new') = (reviewer_id IS NULL)`, `(reviewer_id IS NULL) = (taken_at IS NULL)`, `decision = 'accepted' OR effort_hours IS NULL`, `effort_hours IS NULL OR effort_hours > 0`; старые CHECK `accepted_has_skill`, `rejected_has_reason`, `reason_only_when_rejected` сохраняются; частичный индекс очереди пересоздан `WHERE decision IN ('new','under_review')`; уникальные индексы `lower(btrim(name))` на `portal_agents` и `portal_products` (дубль без учёта регистра отвергается); перед индексами `DO $$ … RAISE EXCEPTION` с перечнем дублей. Существующие строки не теряются, принятая старая заявка без оценки допустима. Тесты: backend/src/database/postgres/portal-request-review-migration.spec.ts (по образцу `portal-catalog-archive-migration.spec.ts`). Реализация: backend/db/migrations/035_portal_request_review.sql (откат комментарием, см. design.md «Migration Plan»). Готово, когда тест green при заданной `PROGRAMS_ETL_TEST_ADMIN_URL`

## 2. backend, домен: жизненный цикл заявки и оценка
> track: backend
> depends: —
> specs: featurer-requests → «Статус заявки для автора»; featurer-requests → «Взятие заявки в работу»; featurer-requests → «Решение «принять в навык»»; featurer-requests → «Решение «отклонить с причиной»»
> arch: Entities/IdeaRequest; Aggregates/IdeaRequest; Value Objects/RequestDecision; Value Objects/RequestStatusKind; Value Objects/EffortHours; Value Objects/RequestStatus / RequestStatusPolicy
> files: domain/request-decision.ts; domain/idea-request.ts; domain/effort-hours.ts; domain/request-status-policy.ts; domain/errors.ts; domain/*.spec.ts; interface/portal-error-status.ts
> frames: —

- [ ] 2.1 TDD: `EffortHours.of(n)` принимает целые 1..2000 (`MAX_EFFORT_HOURS`), иначе `ArgumentInvalidError` (0, −1, 1.5, 2001, NaN). Тесты: domain/effort-hours.spec.ts. Реализация: domain/effort-hours.ts
- [ ] 2.2 TDD: `RequestDecision` — `new | under_review{reviewerId, takenAt} | accepted{reviewerId, takenAt, skillId, effortHours: number|null, decidedBy, decidedAt} | rejected{reviewerId, takenAt, reason, decidedBy, decidedAt}`; тип `RequestStatusKind`; `IdeaRequest.create` даёт `new`; `take(by, now)` только из `new` (из `under_review` → `RequestAlreadyTakenError`, из решённой → `RequestAlreadyDecidedError`); геттер `statusKind`. Тесты: domain/idea-request.spec.ts, domain/request-decision.spec.ts. Реализация: domain/request-decision.ts, domain/idea-request.ts, domain/errors.ts (+ коды в `PortalErrorCode`)
- [ ] 2.3 TDD: `accept(skillId, effort: EffortHours, by, now)` и `reject(reason, by, now)` только из `under_review`; из `new` → `RequestNotTakenError`, из решённой → `RequestAlreadyDecidedError`; взявший сохраняется в решённом состоянии; `decidedBy` может отличаться от `reviewerId`. Тесты: domain/idea-request.spec.ts. Реализация: domain/idea-request.ts, domain/errors.ts
- [ ] 2.4 TDD: `RequestStatusPolicy.statusOf` возвращает `new` «Новая», `under_review` «На рассмотрении», `rejected` «Отклонена», принятая — статус навыка; коды `pending` больше нет. Новые ошибки зарегистрированы в `portal-error-status.ts` (409 / 404 для `ProductNotFound`). Тесты: domain/request-status-policy.spec.ts, domain/errors.spec.ts. Реализация: domain/request-status-policy.ts, interface/portal-error-status.ts. Поправить места, где использовался `pending`/`RequestDecision.pending()` (test-doubles, сидеры тестов), чтобы typecheck проходил

## 3. backend, домен: `Slug`, `CatalogName`, `Product.create`
> track: backend
> depends: —
> specs: featurer-catalog → «Slug нового агента и продукта»; featurer-catalog → «Уникальность названий агентов и продуктов»; featurer-requests → «Принятие с созданием агента»
> arch: Value Objects/Slug; Value Objects/CatalogName; Entities/Product; Entities/Agent
> files: domain/slug.ts; domain/slug.spec.ts; domain/catalog-name.ts; domain/catalog-name.spec.ts; domain/product.ts; domain/product.spec.ts; domain/errors.ts
> frames: —

- [ ] 3.1 TDD: `Slug.fromName(name, fallback)` — транслитерация кириллицы (упрощённый ГОСТ 7.79-2000 Б: ж→zh, х→kh, ц→ts, ч→ch, ш→sh, щ→shch, ю→yu, я→ya, ъ/ь→'', й→y, ё→e), lower-case, `[^a-z0-9]+`→`-`, обрезка дефисов, усечение до 60; пустой результат → `fallback` (`agent`/`product`); `Slug.withSuffix(base, n)` → `base-n`. Примеры из спеки: «Сверка актов» → `sverka-aktov`, «Веб 2.0» → `veb-2-0`, «★★★» → `agent`. Тесты: domain/slug.spec.ts. Реализация: domain/slug.ts
- [ ] 3.2 TDD: `CatalogName.of(value)` — trim, непустое, ≤ 100 (`MAX_CATALOG_NAME_LENGTH`), иначе `ArgumentInvalidError`; `key` = `lower(trim)`; `Product.create({ id, slug, name })`; новые ошибки `AgentNameTakenError` (`PORTAL_AGENT_NAME_TAKEN`, сообщение «агент с таким названием уже есть»), `ProductNameTakenError` (`PORTAL_PRODUCT_NAME_TAKEN`, «продукт с таким названием уже есть»), `ProductNotFoundError` (`PORTAL_PRODUCT_NOT_FOUND`). Тесты: domain/catalog-name.spec.ts, domain/product.spec.ts. Реализация: domain/catalog-name.ts, domain/product.ts, domain/errors.ts

## 4. backend, контракты событий
> track: backend
> depends: —
> specs: featurer-requests → «События по заявкам в outbox»
> arch: Services/TakeRequestUseCase; Services/AcceptRequestUseCase
> files: contracts/request-taken.event.ts; contracts/request-accepted.event.ts; contracts/register-portal-events.ts; contracts/portal-events.spec.ts
> frames: —

- [ ] 4.1 TDD: `RequestTakenEvent` (`portal.request_taken`, payload `{ authorId, reviewerId, requestTitle }`, `requestId` = `aggregateId`) регистрируется и разбирается из outbox; `RequestAcceptedEvent` получает `effortHours` (в схеме payload `optional()`: старое событие без поля разбирается). Тесты: contracts/portal-events.spec.ts. Реализация: contracts/request-taken.event.ts, contracts/request-accepted.event.ts, contracts/register-portal-events.ts

## 5. backend, инфраструктура: репозиторий и read-модель заявок
> track: backend
> depends: 1, 2
> specs: featurer-requests → «Мои заявки»; featurer-requests → «Очередь заявок разработчика»; featurer-requests → «Взятие заявки в работу»
> arch: Services/RequestRepository / SlonikRequestRepository; Services/RequestQuery / SlonikRequestQuery
> files: domain/ports/request-repository.port.ts; domain/ports/request-query.port.ts; infrastructure/slonik-request.repository.ts; infrastructure/slonik-request.query.ts; infrastructure/postgres-portal.repositories.spec.ts; application/test-doubles.ts
> frames: —

- [ ] 5.1 TDD: `RequestRepository.save(request, expected?)`: без `expected` — вставка новой (`new`); с `expected` — `UPDATE … WHERE id AND decision = expected`, пишет `decision`, `reviewer_id`, `taken_at`, `effort_hours`, `skill_id`, причину, `decided_*`; 0 строк → перечитать и бросить `RequestAlreadyTakenError` (фактически `under_review` при ожидаемом `new`) или `RequestAlreadyDecidedError`; `findById` восстанавливает все варианты `RequestDecision`, включая принятую без оценки. Два параллельных `take` одной заявки: один успешен, второй — ошибка. Тесты: infrastructure/postgres-portal.repositories.spec.ts. Реализация: port + infrastructure/slonik-request.repository.ts; in-memory двойник в application/test-doubles.ts с той же семантикой `expected`
- [ ] 5.2 TDD: `RequestView` получает `reviewer: { id, login, fullName } | null` (полное имя по правилам `employee-directory`, без ФИО — логин), `takenAt`, `effortHours`; `listPending` возвращает `new` и `under_review`, старые первыми, с общим числом; `listByAuthor` и `findView` отдают новые поля. Тесты: infrastructure/postgres-portal.repositories.spec.ts. Реализация: domain/ports/request-query.port.ts, infrastructure/slonik-request.query.ts

## 6. backend, инфраструктура: создание агента и продукта в каталоге
> track: backend
> depends: 1, 3
> specs: featurer-catalog → «Продукты и агенты из seed»; featurer-catalog → «Slug нового агента и продукта»; featurer-catalog → «Уникальность названий агентов и продуктов»
> arch: Services/CatalogRepository / SlonikCatalogRepository; Services/SeedPortalCatalogUseCase
> files: domain/ports/catalog-repository.port.ts; infrastructure/slonik-catalog.repository.ts; infrastructure/postgres-portal.repositories.spec.ts; application/seed-portal-catalog.use-case.ts; application/seed-portal-catalog.use-case.spec.ts; application/seed-portal.cli.ts; application/test-doubles.ts
> frames: —

- [ ] 6.1 TDD: `findAgentByName(key)` / `findProductByName(key)` (с архивными, сравнение `lower(btrim(name))`); `nextFreeSlug(kind, base)` возвращает `base`, а при занятом — первый свободный `base-N` (учитываются архивные). Тесты: infrastructure/postgres-portal.repositories.spec.ts. Реализация: port + infrastructure/slonik-catalog.repository.ts
- [ ] 6.2 TDD: `insertProduct(product)` и `insertAgent(agent)` (агент + строки `portal_agent_products`); unique violation по индексу названия → `ProductNameTakenError` / `AgentNameTakenError`; по `slug` → внутренняя `SlugTakenError` (экспортируется из порта для повтора). Тесты: тот же spec. Реализация: infrastructure/slonik-catalog.repository.ts; in-memory двойник в application/test-doubles.ts
- [ ] 6.3 TDD: сидер пропускает продукт или агента, чьё название (без учёта регистра) занято записью с другим `slug`, вместе с их связями, сообщает об этом в результате (`skipped: { kind, slug, name }[]`), CLI печатает предупреждение и завершается с кодом 0; повторный запуск по-прежнему не создаёт дублей. Тесты: application/seed-portal-catalog.use-case.spec.ts, infrastructure/postgres-portal.repositories.spec.ts. Реализация: infrastructure/slonik-catalog.repository.ts (`seed`), application/seed-portal-catalog.use-case.ts, application/seed-portal.cli.ts

## 7. backend, application: взятие, решение, очередь
> track: backend
> depends: 2, 3, 4, 5, 6
> specs: featurer-requests → «Взятие заявки в работу»; featurer-requests → «Решение «принять в навык»»; featurer-requests → «Принятие с созданием агента»; featurer-requests → «Решение «отклонить с причиной»»; featurer-requests → «Очередь заявок разработчика»; featurer-requests → «События по заявкам в outbox»
> arch: Services/TakeRequestUseCase; Services/AcceptRequestUseCase; Services/RejectRequestUseCase; Services/ListQueueUseCase
> files: application/take-request.use-case.ts; application/take-request.use-case.spec.ts; application/accept-request.use-case.ts; application/accept-request.use-case.spec.ts; application/reject-request.use-case.ts; application/reject-request.use-case.spec.ts; application/list-queue.use-case.ts; application/queue-agents.use-cases.spec.ts; portal.module.ts
> frames: —

- [ ] 7.1 TDD: `TakeRequestUseCase.execute({ requestId, reviewerId })` в транзакции: `findById` (нет → 404), `take`, `save(request, 'new')`, `RequestTakenEvent` в outbox, ответ `findView`; повторное взятие → 409 без события. Тесты: application/take-request.use-case.spec.ts. Реализация: application/take-request.use-case.ts, регистрация в portal.module.ts
- [ ] 7.2 TDD: `AcceptRequestUseCase` с `effortHours` и `target.kind`: `existing_skill` и `new_skill` — как раньше (архив → 409, нет → 404); заявка `new` → 409 без записей в каталог; неверная оценка → 400; `save(request, 'under_review')`; событие с `effortHours`. Тесты: application/accept-request.use-case.spec.ts. Реализация: application/accept-request.use-case.ts
- [ ] 7.3 TDD: `target.kind = 'new_agent'`: проверка `productIds` (нехватка → `ProductNotFoundError`), при `newProduct` — проверка названия, `nextFreeSlug`, `insertProduct`; агент — проверка названия, `Slug.fromName`, `nextFreeSlug`, `Agent.create` со связями, `insertAgent`; навык `planned`; занятый `slug` при вставке — до 3 повторов подбора (хелпер `createWithFreeSlug`, вложенная транзакция-savepoint); занятое название → 409; любая ошибка — ничего не создано, заявка `under_review`; одно событие принятия. Тесты: application/accept-request.use-case.spec.ts. Реализация: application/accept-request.use-case.ts
- [ ] 7.4 TDD: `RejectRequestUseCase` — только из `under_review` (`new` → 409), `save(request, 'under_review')`; `ListQueueUseCase` возвращает `new` и `under_review`. Тесты: application/reject-request.use-case.spec.ts, application/queue-agents.use-cases.spec.ts. Реализация: application/reject-request.use-case.ts, application/list-queue.use-case.ts

## 8. backend, HTTP: эндпоинт взятия, тело принятия, ответы
> track: backend
> depends: 7
> specs: featurer-requests → «Взятие заявки в работу»; featurer-requests → «Решение «принять в навык»»; featurer-requests → «Принятие с созданием агента»; featurer-requests → «Мои заявки»; featurer-catalog → «Продукты и агенты из seed»
> arch: Services/RequestsController
> files: interface/http/requests.controller.ts; interface/http/requests.controller.spec.ts; interface/http/requests.schemas.ts; interface/http/requests.responses.ts; portal-flow.e2e.spec.ts
> frames: —

- [ ] 8.1 TDD: `acceptRequestSchema` — `{ effortHours, target }`, `target` — `z.discriminatedUnion('kind', …)` из трёх вариантов; у `new_agent` `refine(productIds.length > 0 || newProduct)` → 400; старые формы тела (`{skillId}` верхнего уровня) → 400; названия по `MAX_CATALOG_NAME_LENGTH`. Тесты: interface/http/requests.controller.spec.ts. Реализация: interface/http/requests.schemas.ts
- [ ] 8.2 TDD: `POST /portal/requests/:id/take` (`@Roles('developer')`, 200 `RequestResponse`; 401/403/404/409, неверный uuid → 400); `RequestResponse` получает `reviewer`, `takenAt` (ISO | null), `effortHours`, коды статуса `new`/`under_review`; Swagger-описания обновлены. Тесты: interface/http/requests.controller.spec.ts. Реализация: interface/http/requests.controller.ts, interface/http/requests.responses.ts
- [ ] 8.3 TDD: сквозной e2e портала: подача → `new` → взятие → `under_review` с взявшим → принятие с новым агентом и новым продуктом и оценкой → автор видит статус навыка, оценку и взявшего; агент появился в `GET /portal/catalog`; принятие из `new` → 409. Тесты: portal-flow.e2e.spec.ts (обновить под новые статусы и тело). Реализация: правки по результатам

## 9. backend, notifications: `request.under-review`
> track: backend
> depends: 4
> specs: notifications → «Уведомление автора о взятии заявки в работу»; notifications → «Доставка уведомлений о заявках по каналам»
> arch: Services/RequestTakenRule; Services/RequestTakenSubscriber; Services/UserDirectoryPort / адаптер
> files: backend/src/modules/notifications/domain/request-taken.rule.ts; domain/request-taken.rule.spec.ts; domain/notification-type.ts; domain/notification-type.spec.ts; domain/ports/user-directory.port.ts; infrastructure/user-directory.ts; application/request-taken.subscriber.ts; application/request-taken.subscriber.spec.ts; application/notification-event-subscriptions.ts; application/test-doubles.ts
> frames: —

- [ ] 9.1 TDD: `RequestTakenRule.apply(event, reviewerName)` — одно уведомление автору, тип `request.under-review`, заголовок «Заявка взята в работу: {название}», текст с названием и именем взявшего, цель `request` с id заявки, инициатор — взявший; `authorId === reviewerId` → пусто; тип добавлен в `NotificationType`. Тесты: domain/request-taken.rule.spec.ts, domain/notification-type.spec.ts. Реализация: domain/request-taken.rule.ts, domain/notification-type.ts
- [ ] 9.2 TDD: `UserDirectoryPort.findFullNameById(id)` — ФИО (фамилия, имя, отчество через пробел) или логин, `null` для неизвестного. Тесты: infrastructure/notification.repository.spec.ts (или соседний spec адаптера). Реализация: domain/ports/user-directory.port.ts, infrastructure/user-directory.ts, двойник в application/test-doubles.ts
- [ ] 9.3 TDD: `RequestTakenSubscriber` (`notifications.request-taken`) на `RequestTakenEvent`: неизвестный взявший → `NotificationActorNotFoundError`; повторная обработка не дублирует (идемпотентность `CreateNotificationsUseCase` по `event.id`); подписка зарегистрирована, доставка в Telegram идёт существующим каналом. Тесты: application/request-taken.subscriber.spec.ts, application/notification-event-subscriptions.spec.ts. Реализация: application/request-taken.subscriber.ts, application/notification-event-subscriptions.ts

## 10. portal, модель: схемы, подписи, API решения
> track: portal
> depends: 8
> specs: featurer-portal-ui → «Мои заявки»; featurer-portal-ui → «Очередь и решение для разработчика»
> arch: Features/decision; Features/requests; Hooks/useTakeRequest
> files: portal/src/lib/schemas/index.ts; portal/src/lib/schemas/schemas.test.ts; portal/src/lib/status-labels.ts; portal/src/styles/index.css; portal/src/features/decision/model/decision.api.ts; portal/src/features/decision/model/decision.queries.ts; portal/src/features/decision/model/use-take-request.ts; portal/src/features/decision/model/decision-cache.ts; portal/src/features/decision/model/decision.test.tsx; portal/src/features/requests/model/requests.schema.ts
> frames: —

- [ ] 10.1 TDD: Zod-схема заявки: коды `new`/`under_review` вместо `pending`, `reviewer` (`{ id, login, fullName } | null`), `takenAt`, `effortHours` (`number | null`); подписи «Новая», «На рассмотрении» и классы бейджей в `lib/status-labels.ts` (`new`: `surface-sunken`/`ink-40`/`ink-80`; `under_review`: `purple-soft`/`accent-purple`/`ink-80`); токен `--color-purple-soft: #F0EBFF` в `styles/index.css`. Тесты: portal/src/lib/schemas/schemas.test.ts, portal/src/features/requests/model/requests.schema.test.ts. Реализация: перечисленные файлы
- [ ] 10.2 TDD: `decision.api.ts`: `takeRequest(id)` (`POST /portal/requests/:id/take`), `acceptRequest(id, { effortHours, target })` с `AcceptTarget` по `kind`; `useTakeRequest`: при успехе кладёт заявку в кеш и инвалидирует очередь, при 409 инвалидирует заявку и очередь; `decisionErrorMessage` различает по `code`: `PORTAL_REQUEST_ALREADY_TAKEN`, `PORTAL_REQUEST_NOT_TAKEN`, `PORTAL_REQUEST_ALREADY_DECIDED`, `PORTAL_SKILL_ARCHIVED`, `PORTAL_AGENT_ARCHIVED`, `PORTAL_AGENT_NAME_TAKEN`, `PORTAL_PRODUCT_NAME_TAKEN`, `PORTAL_PRODUCT_NOT_FOUND`. Тесты: portal/src/features/decision/model/decision.test.tsx. Реализация: decision.api.ts, use-take-request.ts, decision.queries.ts, decision-cache.ts

## 11. portal: «Взять в работу» и экран заявки разработчика
> track: portal
> depends: 10
> specs: featurer-portal-ui → «Очередь и решение для разработчика»
> arch: Pages/RequestPage; UI-компоненты/TakeRequestAction; Features/decision
> files: portal/src/features/decision/ui/TakeRequestAction.tsx; portal/src/features/decision/ui/TakeRequestAction.test.tsx; portal/src/features/decision/index.ts; portal/src/pages/RequestPage.tsx; portal/src/pages/RequestPage.test.tsx
> frames: Fr8BO; eyLDP; RTdWn

- [ ] 11.1 TDD: `TakeRequestAction`: заголовок «Заявка ещё не в работе», пояснение, кнопка «Взять в работу» (иконка `user-check`, во время запроса `disabled` и «Берём в работу…»), подсказка «Решение сможет принять любой разработчик»; при успехе вызывает `onTaken(request)`; при 409 показывает `Alert` с сообщением сервера. Тесты: portal/src/features/decision/ui/TakeRequestAction.test.tsx. Вёрстка по фреймам `Fr8BO` (панель `f6EG4`), `eyLDP`, сверка с макетом в этой же задаче
- [ ] 11.2 TDD: `RequestPage` для разработчика выбирает действие по `status.code`: `new` → `TakeRequestAction` (кнопок «Принять»/«Отклонить» нет), `under_review` → `DecisionPanel`, решённые → просмотр; после взятия экран без перезагрузки показывает «На рассмотрении», взявшего и панель решения; при 409 «уже взяли» — заявка на рассмотрении с именем взявшего и `Alert` над панелью (фрейм `RTdWn`). Страница берёт `products` из `catalogQuery()` и передаёт в `DecisionPanel`. Тесты: portal/src/pages/RequestPage.test.tsx. Вёрстка по фреймам `Fr8BO`, `RTdWn`

## 12. portal: панель решения — оценка и новый агент
> track: portal
> depends: 10
> specs: featurer-portal-ui → «Очередь и решение для разработчика»
> arch: UI-компоненты/DecisionPanel; UI-компоненты/EffortField; UI-компоненты/SkillPicker; UI-компоненты/ProductMultiSelect; Features/skills
> files: portal/src/features/decision/ui/DecisionPanel.tsx; portal/src/features/decision/ui/DecisionPanel.test.tsx; portal/src/features/decision/ui/EffortField.tsx; portal/src/features/skills/ui/SkillPicker.tsx; portal/src/features/skills/ui/SkillPicker.test.tsx; portal/src/features/skills/ui/ProductMultiSelect.tsx; portal/src/features/skills/ui/ProductMultiSelect.test.tsx; portal/src/features/skills/index.ts
> frames: N1Hvuf; nSa5S; hVDQX; S5Wnw0

- [ ] 12.1 TDD: `DecisionPanel`: строка взявшего «В работе у {имя} · с {дата}» под заголовком; поле «Оценка трудозатрат, ч» (`EffortField`, иконка `timer`, подсказка «увидит автор», помощь) только в режиме «Принять», стоит над выбором навыка; пустая, нулевая или дробная оценка — ошибка у поля, запрос не уходит; при отклонении оценка не отправляется. Тесты: portal/src/features/decision/ui/DecisionPanel.test.tsx. Вёрстка по фрейму `N1Hvuf` (панель `L5ERx`, поле `bkPGD`)
- [ ] 12.2 TDD: `ProductMultiSelect` — `fieldset` с `legend` «Продукты» и подсказкой «хотя бы один», чекбоксы из `components/ui/checkbox`, ошибка связана с группой (`aria-describedby`). Тесты: portal/src/features/skills/ui/ProductMultiSelect.test.tsx. Вёрстка по фрейму `nSa5S` (`bqKHF`)
- [ ] 12.3 TDD: `SkillPicker` — три чипа «Существующий», «Новый навык», «Новый агент» (`aria-pressed`); режим `new_agent`: группа «Новый агент» (название, продукты, «Новый продукт» необязательно) и группа «Навык» (название, «Что делает»); `toTarget` в `DecisionPanel` собирает `{ kind: 'new_agent', agent: { name, productIds, newProduct? }, skill }`; без названия агента или без продукта (ни отмеченного, ни нового) — ошибки у полей; кнопка «Создать и принять». На 360 чипы и кнопки — столбцом. Тесты: portal/src/features/skills/ui/SkillPicker.test.tsx, portal/src/features/decision/ui/DecisionPanel.test.tsx. Вёрстка по фреймам `nSa5S`, `hVDQX`
- [ ] 12.4 TDD: 409 `PORTAL_AGENT_NAME_TAKEN` / `PORTAL_PRODUCT_NAME_TAKEN`: `Alert` вверху панели с сообщением сервера, у поля названия красная рамка и «Название занято», введённые значения сохраняются, списки не инвалидируются; 409 архив — прежнее поведение (обновить навыки и агентов). Тесты: portal/src/features/decision/ui/DecisionPanel.test.tsx. Вёрстка по фрейму `S5Wnw0`

## 13. portal: экраны автора и очередь
> track: portal
> depends: 10
> specs: featurer-portal-ui → «Мои заявки»; featurer-portal-ui → «Анкета идеи»; featurer-portal-ui → «Очередь и решение для разработчика»
> arch: Pages/QueuePage; Pages/MyRequestsPage; UI-компоненты/RequestDetails; UI-компоненты/RequestList; UI-компоненты/RequestStatusBadge
> files: portal/src/features/requests/ui/RequestDetails.tsx; portal/src/features/requests/ui/RequestDetails.test.tsx; portal/src/features/requests/ui/RequestList.tsx; portal/src/features/requests/ui/RequestList.test.tsx; portal/src/features/requests/ui/RequestStatusBadge.tsx; portal/src/features/requests/ui/RequestStatusBadge.test.tsx; portal/src/features/requests/ui/request-presentation.ts; portal/src/pages/QueuePage.tsx; portal/src/pages/QueuePage.test.tsx; portal/src/pages/MyRequestsPage.test.tsx
> frames: C3DRWH; Z4a9Yl; G59Tb0

- [ ] 13.1 TDD: `RequestStatusBadge` для `new` и `under_review` (цвета из `lib/status-labels.ts`); «Мои заявки» и анкета после подачи показывают «Новая». Тесты: RequestStatusBadge.test.tsx, portal/src/pages/MyRequestsPage.test.tsx. Реализация: RequestStatusBadge.tsx, request-presentation.ts
- [ ] 13.2 TDD: `RequestDetails` автора: «Путь заявки» из 6 шагов (шаг «Новая» перед «На рассмотрении»), у «На рассмотрении» дата и имя взявшего; в мете «в работе у {имя} с {дата}»; в карточке навыка строка «Оценка разработчика · 16 ч», для `effortHours: null` — «—». Тесты: RequestDetails.test.tsx. Вёрстка по фреймам `C3DRWH`, `Z4a9Yl` (строка `r83nn`)
- [ ] 13.3 TDD: очередь: подзаголовок из макета, колонка «Статус» после «Заявки» (бейдж и у «На рассмотрении» строка «{имя} · с {ДД.ММ}»), автор полным именем; на 360 бейдж и взявший под названием. Тесты: RequestList.test.tsx, portal/src/pages/QueuePage.test.tsx. Вёрстка по фрейму `G59Tb0` (таблица `M9Rsw`)

## 14. Интеграционная проверка и документация
> track: integration
> depends: 8, 9, 11, 12, 13
> specs: featurer-requests → «Взятие заявки в работу»; featurer-requests → «Принятие с созданием агента»; notifications → «Уведомление автора о взятии заявки в работу»; featurer-portal-ui → «Очередь и решение для разработчика»
> arch: Pages/RequestPage; Services/RequestsController
> files: portal/src/features/decision/model/decision.api.ts; backend/src/modules/portal/interface/http/requests.responses.ts; backend/src/modules/notifications/portal-notifications.e2e.spec.ts; openspec/changes/add-featurer-ideas-review/design.md
> frames: —

- [ ] 14.1 Контракт фронт—бэк: Zod-схемы портала разбирают реальные ответы `RequestResponse` (все статусы, `reviewer`, `takenAt`, `effortHours`), тело `accept` портала проходит `acceptRequestSchema` бэкенда (три варианта). Тесты: e2e `portal-notifications.e2e.spec.ts` дополнен взятием в работу (`request.under-review` у автора, не у разработчика-автора) и фикстура портала из ответа бэкенда. Готово, когда тесты green
- [ ] 14.2 без тестов: документация — в design.md «Migration Plan» проверочный SQL на дубли названий приведён явно; при наличии `.env.example`/README модуля — упоминание `035` и нового эндпоинта. Сквозной сценарий в браузере (подача → взять в работу → принять с новым агентом → автор видит «Запланировано» и оценку) выполнить, если доступны БД и dev-сервер; иначе зафиксировать в итоге, что не выполнен

## 15. Code review
> track: review
> depends: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14

- [ ] 15.1 Code review всех изменений change от base commit по измерениям: соответствие specs/design, стандарты проекта, корректность (выполняет фаза Review workflow `apply-openspec-change`)
- [ ] 15.2 Исправить blocking и major (дефекты поведения — через тест, воспроизводящий ошибку), не больше 2 раундов ревью; оставшиеся minor перечислить в итоге; регрессия зелёная
