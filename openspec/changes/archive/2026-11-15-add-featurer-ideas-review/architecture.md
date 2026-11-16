# Architecture: add-featurer-ideas-review

## Scope

Бэкенд-модуль `backend/src/modules/portal`: состояние `under_review` и взятие в работу, оценка трудозатрат, принятие с созданием агента и продукта, генерация `slug`, уникальность названий. Модуль `notifications`: правило и подписчик `request.under-review`. Портал `portal/src`: фичи `decision`, `skills`, `requests`, страницы очереди и заявки.

---

## Backend — Domain Model

### Entities
| Name | Status (new/existing) | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `IdeaRequest` (`domain/idea-request.ts`) | existing, меняется | да | `authorId`, поля анкеты, `decision` (теперь `new \| under_review \| accepted \| rejected`, с `reviewerId`, `takenAt`, `effortHours`) | Заявка: жизненный цикл `new → under_review → accepted/rejected` |
| `Agent` (`domain/agent.ts`) | existing, без изменений поведения | да | `slug`, `name`, `productIds`, `archivedAt` | Создаётся `Agent.create` при принятии заявки, а не только сидером |
| `Product` (`domain/product.ts`) | existing → получает фабрику | нет (запись каталога) | `id`, `slug`, `name` | Добавляется `Product.create({ id, slug, name })` с проверкой названия |
| `Skill` (`domain/skill.ts`) | existing, без изменений | да | — | Создаётся при принятии, как в Э0 |

### Aggregates
| Aggregate | Root entity | Входит в состав (entities/VO) | Инварианты, которые защищает |
|---|---|---|---|
| IdeaRequest | `IdeaRequest` | `RequestDecision`, `RequestTitle`, `Frequency`, `RejectReason`, `EffortHours` | `take` только из `new`. `accept`/`reject` только из `under_review`. Принятая заявка всегда с навыком и оценкой (для новых принятий), отклонённая — с причиной. Взявший сохраняется во всех состояниях после `new`. После решения ничего не меняется |
| Agent | `Agent` | `Slug` | Минимум один продукт (`validate`). `slug` после создания не меняется |

### Value Objects
| Name | Поля | Почему VO (immutable/self-validating) |
|---|---|---|
| `RequestDecision` (`domain/request-decision.ts`, existing, меняется) | размеченное объединение: `new`; `under_review{reviewerId, takenAt}`; `accepted{reviewerId, takenAt, skillId, effortHours, decidedBy, decidedAt}`; `rejected{reviewerId, takenAt, reason, decidedBy, decidedAt}` | Недопустимые сочетания («принята без навыка», «на рассмотрении без взявшего») невозможно собрать |
| `RequestStatusKind` (`domain/request-decision.ts`, new тип) | `'new' \| 'under_review' \| 'accepted' \| 'rejected'` | Ожидаемый статус для условного `save` |
| `EffortHours` (`domain/effort-hours.ts`, new) | `value: number` (целое `1..MAX_EFFORT_HOURS = 2000`) | Самопроверка при создании, 400 через `ArgumentInvalidError` |
| `Slug` (`domain/slug.ts`, new) | `value: string`; `Slug.fromName(name, fallback)`, `Slug.withSuffix(base, n)` | Детерминированная транслитерация и нормализация, чистая функция |
| `CatalogName` (`domain/catalog-name.ts`, new) | `value: string` (trim, непустое, `≤ MAX_CATALOG_NAME_LENGTH = 100`), `key` (`lower(trim)`) | Общие правила названия агента и продукта и ключ сравнения уникальности |
| `RequestStatus` / `RequestStatusPolicy` (existing, меняется) | `code: 'new' \| 'under_review' \| 'rejected' \| SkillStatus`, `label` | Подписи «Новая», «На рассмотрении» |

### Services
| Service | Слой (application/domain/infrastructure) | Ответственность |
|---|---|---|
| `TakeRequestUseCase` (new, `application/take-request.use-case.ts`) | application | В транзакции: `findById` → `request.take` → `save(request, 'new')` → `RequestTakenEvent` → `findView` |
| `AcceptRequestUseCase` (existing, меняется) | application | Оценка, проверка `under_review`, три варианта цели; для `new_agent` — продукты, новый продукт, агент со связями, навык; `save(request, 'under_review')`; событие с `effortHours` |
| `RejectRequestUseCase` (existing, меняется) | application | Проверка `under_review`, `save(request, 'under_review')` |
| `ListQueueUseCase` (existing, меняется) | application | Очередь `new` и `under_review` |
| `SeedPortalCatalogUseCase` (existing, меняется) | application | Предупреждение о записях, пропущенных из-за занятого названия |
| `RequestRepository` / `SlonikRequestRepository` (existing, меняется) | domain port / infrastructure | `save(request, expected?)` — вставка новой или условный `UPDATE … WHERE decision = expected`; маппинг `reviewer_id`, `taken_at`, `effort_hours` |
| `RequestQuery` / `SlonikRequestQuery` (existing, меняется) | domain port / infrastructure | `reviewer` (JOIN профиля по правилам `employee-directory`), `takenAt`, `effortHours`; `listPending` по двум статусам |
| `CatalogRepository` / `SlonikCatalogRepository` (existing, меняется) | domain port / infrastructure | Новые методы: `findAgentByName`, `findProductByName`, `nextFreeSlug`, `insertProduct`, `insertAgent` (со связями); перевод unique violation в `AgentNameTakenError` / `ProductNameTakenError`, повтор подбора `slug` |
| `RequestTakenRule` (new, `notifications/domain/request-taken.rule.ts`) | domain (notifications) | Черновик уведомления `request.under-review`, пропуск автора-разработчика |
| `RequestTakenSubscriber` (new, `notifications/application/request-taken.subscriber.ts`) | application (notifications) | Обрабатывает `RequestTakenEvent`, берёт имя через `UserDirectoryPort.findFullNameById`, создаёт уведомления |
| `UserDirectoryPort` / адаптер (existing, меняется, `notifications/domain/ports/user-directory.port.ts`) | port / infrastructure | `findFullNameById(id)` — ФИО или логин |
| `RequestsController` (existing, меняется) | interface | `POST /portal/requests/:id/take`; новое тело `accept`; поля `reviewer`, `takenAt`, `effortHours` в `RequestResponse` |

### Method Signatures (ключевые, по каждому сервису)
| Service.Method | Params | Returns | Краткое описание |
|---|---|---|---|
| `IdeaRequest.take` | `by: string, now: Date` | `void` | Только из `new`; иначе `RequestAlreadyTakenError` / `RequestAlreadyDecidedError` |
| `IdeaRequest.accept` | `skillId: string, effort: EffortHours, by: string, now: Date` | `void` | Только из `under_review`; из `new` — `RequestNotTakenError` |
| `IdeaRequest.reject` | `reason: string, by: string, now: Date` | `void` | Только из `under_review` |
| `IdeaRequest.statusKind` (getter) | — | `RequestStatusKind` | Для `save(request, expected)` в use-case |
| `EffortHours.of` | `value: number` | `EffortHours` | `ArgumentInvalidError` вне `1..2000` или не целое |
| `Slug.fromName` | `name: string, fallback: 'agent' \| 'product'` | `string` | Транслитерация и нормализация, усечение до 60 символов |
| `Slug.withSuffix` | `base: string, n: number` | `string` | `base-n` (`n ≥ 2`) |
| `CatalogName.of` | `value: string` | `CatalogName` | Trim, непустое, предел длины |
| `Product.create` | `{ id, slug, name: CatalogName }` | `Product` | Новый продукт |
| `RequestStatusPolicy.statusOf` | `decision: RequestDecision, skillStatus: SkillStatus \| null` | `RequestStatus` | + `new`, `under_review` |
| `TakeRequestUseCase.execute` | `{ requestId, reviewerId }` | `RequestView` | 404 / 409 |
| `AcceptRequestUseCase.execute` | `{ requestId, decidedBy, effortHours: number, target: AcceptTarget }` | `RequestView` | `AcceptTarget = { kind: 'existing_skill', skillId } \| { kind: 'new_skill', agentId, name, description } \| { kind: 'new_agent', agent: { name, productIds, newProduct?: { name } }, skill: { name, description } }` |
| `RejectRequestUseCase.execute` | `{ requestId, decidedBy, reason }` | `RequestView` | 409 из `new` |
| `RequestRepository.save` | `request: IdeaRequest, expected?: RequestStatusKind` | `void` | Без `expected` — вставка новой; 0 строк → ошибка по фактическому статусу |
| `CatalogRepository.findAgentByName` / `findProductByName` | `key: string` (`CatalogName.key`) | `Agent \| null` / `Product \| null` | С учётом архивных |
| `CatalogRepository.nextFreeSlug` | `kind: 'agent' \| 'product', base: string` | `string` | Первый свободный из `base`, `base-2`, … |
| `CatalogRepository.insertProduct` | `product: Product` | `void` | Unique по названию → `ProductNameTakenError`; по `slug` → `SlugTakenError` (внутренняя, ловится для повтора) |
| `CatalogRepository.insertAgent` | `agent: Agent` | `void` | Вставка агента и строк `portal_agent_products`; ошибки — как у продукта |
| `RequestTakenRule.apply` | `event: RequestTakenEvent, reviewerName: string` | `NotificationDraft[]` | Пусто, если `authorId === reviewerId` |
| `UserDirectoryPort.findFullNameById` | `id: string` | `string \| null` | ФИО или логин |

Повтор при занятом `slug` делает `AcceptRequestUseCase` через приватный хелпер `createWithFreeSlug(kind, base, insert)`: до 3 попыток, каждая в savepoint'е (`TransactionRunnerPort.run` во вложенной транзакции). Новые ошибки в `domain/errors.ts`, все дают 409 через `portal-error-status.ts`: `RequestAlreadyTakenError` (`PORTAL_REQUEST_ALREADY_TAKEN`), `RequestNotTakenError` (`PORTAL_REQUEST_NOT_TAKEN`), `AgentNameTakenError` (`PORTAL_AGENT_NAME_TAKEN`), `ProductNameTakenError` (`PORTAL_PRODUCT_NAME_TAKEN`). Ещё одна, `ProductNotFoundError` (`PORTAL_PRODUCT_NOT_FOUND`), даёт 404.

`contracts/`: новый `request-taken.event.ts` (`RequestTakenEvent`, `portal.request_taken`, payload `{ authorId, reviewerId, requestTitle }`) и регистрация в `register-portal-events.ts`. В `request-accepted.event.ts` добавляется `effortHours` (`optional` в схеме payload). `notifications/domain/notification-type.ts`: + `request.under-review`. Миграция: `backend/db/migrations/035_portal_request_review.sql`.

---

## Frontend — UI Model

### Pages
| Page | Route | Структура (ui / +model / +mediator) | Назначение |
|---|---|---|---|
| `QueuePage` (existing, `pages/QueuePage.tsx`) | `/queue` (`RequireRole developer`) | ui + `use-queue.ts` | Колонка статуса и взявшего в списке |
| `RequestPage` (existing, `pages/RequestPage.tsx`) | `/requests/:id` | ui + `use-request.ts` | Для разработчика по `status.code`: `new` → `TakeRequestAction`, `under_review` → `DecisionPanel`, иначе просмотр; для всех — взявший, дата взятия, оценка |
| `MyRequestsPage` (existing) | `/requests` | ui | Только новые подписи через `lib/status-labels.ts` |

### Features (переиспользуемые модули с бизнес-логикой)
| Feature | Статус (new/existing) | Публичный API (index.ts) | model/ (хуки, api.ts) | Назначение |
|---|---|---|---|---|
| `decision` | existing, меняется | `DecisionPanel`, + `TakeRequestAction` | `decision.api.ts` (+`takeRequest`, новый `AcceptTarget` с `kind` и `effortHours`), + `use-take-request.ts`, `decision.queries.ts` (`decisionErrorMessage` по новым кодам), `decision-cache.ts` (обновление заявки и очереди после взятия) | Взятие в работу и решение |
| `skills` | existing, меняется | `SkillPicker` (+ режим `new_agent`), `SkillPickerValue`, `SkillPickerErrors` | — (продукты получает пропом) | Выбор цели принятия |
| `requests` | existing, меняется | без изменений состава | `requests.schema.ts` (`reviewer`, `takenAt`, `effortHours`) | Показ взявшего и оценки в `RequestDetails` и `RequestList` |
| `catalog` | existing | `catalogQuery` (используется для списка продуктов) | — | Источник продуктов для режима `new_agent` |

### UI-компоненты (page-local и shared)
| Component | Расположение (features/<f>/ui · components/ui · pages) | Props (основные) | Назначение |
|---|---|---|---|
| `TakeRequestAction` (new) | `features/decision/ui/TakeRequestAction.tsx` | `request: IdeaRequest`, `onTaken(request)` | Кнопка «Взять в работу», сообщение при 409 |
| `DecisionPanel` (existing) | `features/decision/ui` | `request`, `onDecided`, + `products: Product[]` | Поле «Оценка, ч» в режиме «Принять», передаёт продукты в `SkillPicker` |
| `EffortField` (new, внутренний) | `features/decision/ui/EffortField.tsx` | `value`, `onChange`, `error` | Числовое поле с суффиксом «ч» |
| `SkillPicker` (existing) | `features/skills/ui` | `value: SkillPickerValue` (+ `{ mode: 'new_agent', agentName, productIds, newProductName, name, description }`), `errors`, + `products` | Третий сегмент «Новый агент» |
| `ProductMultiSelect` (new, внутренний) | `features/skills/ui/ProductMultiSelect.tsx` | `products`, `value: string[]`, `onChange`, `error` | Чекбоксы продуктов, `fieldset` с `legend` для доступности |
| `RequestDetails` (existing) | `features/requests/ui` | `request` | Блоки «Взял в работу» и «Оценка» |
| `RequestList` (existing) | `features/requests/ui` | `requests`, + `showReviewer?: boolean` | Колонка взявшего для очереди |
| `RequestStatusBadge` (existing) | `features/requests/ui` | `status` | Цвета `new` и `under_review` |
| `Checkbox` (existing) | `components/ui/checkbox.tsx` | — | Используется в `ProductMultiSelect` |
| `Button`, `Input`, `Textarea`, `Alert`, `Badge` (existing) | `components/ui` | — | Переиспользуются |

Общие модули в `lib/`: `status-labels.ts` (`new` — «Новая», `under_review` — «На рассмотрении», классы бейджей), `schemas/index.ts` (`requestStatusCodeSchema` без `pending`, `reviewer`, `takenAt`, `effortHours`), `format.ts` (форматирование «16 ч», если нет готового).

### Hooks (model)
| Hook | Расположение | Тип (state-хук / query options factory) | Возвращает |
|---|---|---|---|
| `useTakeRequest()` | `features/decision/model/use-take-request.ts` | мутация | при успехе кладёт заявку в кеш и инвалидирует очередь; при 409 инвалидирует заявку и очередь |
| `useAcceptRequest()` (existing) | `features/decision/model/use-accept-request.ts` | мутация | новое тело; при 409 `*_NAME_TAKEN` ничего не инвалидирует |
| `useRejectRequest()` (existing) | `features/decision/model/use-reject-request.ts` | мутация | без изменений, кроме кодов ошибок |
| `catalogQuery()` (existing) | `features/catalog/model/catalog.queries.ts` | query options factory | `RequestPage` берёт `products` и передаёт в `DecisionPanel` (фичи друг друга не импортируют, связывает страница) |
| `useRequest()` / `useQueue()` (existing) | `pages/use-request.ts`, `pages/use-queue.ts` | обёртки `useQuery` | без изменений |

### Паттерны, которые нужно учесть при проектировании
- [x] Публичный API фичи только через `index.ts`: `TakeRequestAction` экспортируется из `features/decision`
- [x] Запросы к backend — через query options factory в `model/*.queries.ts`, мутации — `use-*.ts`
- [x] Ошибки API нормализуются через `ApiError` (`src/lib/errors.ts`), ветвление по `code`: `PORTAL_REQUEST_ALREADY_TAKEN`, `PORTAL_REQUEST_NOT_TAKEN`, `PORTAL_REQUEST_ALREADY_DECIDED`, `PORTAL_SKILL_ARCHIVED`, `PORTAL_AGENT_ARCHIVED`, `PORTAL_AGENT_NAME_TAKEN`, `PORTAL_PRODUCT_NAME_TAKEN`
- [ ] `mediator/` не нужен: на `RequestPage` один виджет действия, он выбирается по статусу (условный рендер по данным, а не по стейту виджетов)
- [x] Именованные слоты не появляются, существующие компоненты не перестраиваются
- [x] `isInitialLoad` / `isRefreshing`: после взятия заявка обновляется из ответа мутации, экран не мигает загрузкой
- [x] Новых общих компонентов нет: `Checkbox` уже есть в `components/ui/`; цвета — токенами

---

## Diagrams

Как и в `add-featurer-catalog-roadmap`, диаграммы описаны текстом, в Miro не переносятся.

### 1. Domain Entity Interaction
`Product *—* Agent` (`portal_agent_products`, минимум один продукт), `Agent 1—* Skill`, `Skill 1—* IdeaRequest` (N:1 по `skillId`, только у `accepted`). `IdeaRequest` содержит `RequestDecision`: `new` → `under_review{reviewerId, takenAt}` → `accepted{…, skillId, effortHours}` | `rejected{…, reason}`. `reviewerId` и `decidedBy` ссылаются на `auth_users` (могут различаться). `Agent` и `Product` получают `Slug` и `CatalogName` (уникальный ключ `lower(trim(name))`).

### 2. External Modules Interaction
Портал (SPA) → `POST /portal/requests/:id/take`, `POST /portal/requests/:id/accept` (новое тело), `GET /portal/queue`, `GET /portal/catalog` (продукты для нового агента). `portal` → `auth` (guard, `@Roles('developer')`). `portal` → outbox в той же транзакции (`RequestTakenEvent`, `RequestAcceptedEvent` с `effortHours`, `RequestRejectedEvent`) → `notifications` асинхронно (`RequestTakenSubscriber` → `UserDirectoryPort.findFullNameById` → `CreateNotificationsUseCase`) → realtime и `telegram` (существующая доставка по каналам). Внешних систем нет.

### 3. Layer Interaction — от Controller до Response
`RequestsController.accept` → Zod (`acceptRequestSchema`, discriminated union по `kind` + `refine` продуктов) → `AcceptRequestUseCase.execute` → транзакция: `RequestRepository.findById` → `EffortHours.of` → `request.accept` (быстрая проверка `under_review`) → по `kind`:
- `existing_skill`: `SkillRepository.findForUpdate` → архив → `CatalogRepository.findAgentForShare` → `ensureActive`;
- `new_skill`: `findAgentForShare` → `ensureActive` → `Skill.create` → `SkillRepository.save`;
- `new_agent`: `findProductsByIds` (нехватка → 404) → [`findProductByName` → `nextFreeSlug` → `insertProduct`] → `findAgentByName` → `nextFreeSlug` → `Agent.create` → `insertAgent` → `Skill.create` → `SkillRepository.save`;

→ `RequestRepository.save(request, 'under_review')` → outbox `RequestAcceptedEvent` → commit → `RequestQuery.findView` → `RequestResponse`. Ошибки: `ArgumentInvalidError` → 400; `RequestNotFound` / `SkillNotFound` / `AgentNotFound` / `ProductNotFound` → 404; `RequestNotTaken` / `RequestAlreadyDecided` / `SkillArchived` / `AgentArchived` / `AgentNameTaken` / `ProductNameTaken` → 409, транзакция откатывается целиком.

`RequestsController.take` → `TakeRequestUseCase` → транзакция: `findById` → `request.take` → `save(request, 'new')` (0 строк → перечитать → `RequestAlreadyTaken` / `RequestAlreadyDecided`) → outbox `RequestTakenEvent` → `findView` → `RequestResponse`.

---

## Confirmation Checklist
- [x] Названия entity/aggregate/VO согласованы
- [x] Названия и сигнатуры ключевых методов сервисов согласованы
- [x] Слои (pages/features/components), структура model/ui и паттерны фронта согласованы
- [x] Диаграммы взаимодействия: текстовое описание, как в прошлом change
- [x] Пользователь подтвердил переход к tasks.md
