# Architecture: add-featurer-bug-reports

## Scope

Бэкенд-модуль `backend/src/modules/portal`: агрегаты бага и комментария к багу, политика переходов и доступа, восемь эндпоинтов, три события. Модуль `notifications`: цель `bug`, три правила и подписчика. Модуль `telegram`: ссылка на баг. Портал `portal/src`: фича `bugs`, четыре страницы, параметр `subject` у фичи `comments`, пункты меню, действие в карточке агента.

---

## Backend — Domain Model

### Entities
| Name | Status (new/existing) | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `BugReport` (`portal/domain/bug-report.ts`) | new | да | `id`, `authorId`, `productId`, `agentId`, `title: BugTitle`, `description: BugDescription`, `status: BugStatus`, `wontFixReason: WontFixReason \| null`, `statusChangedBy \| null`, `createdAt`, `statusChangedAt` | Баг по продукту и агенту, смена статуса по политике |
| `BugComment` (`portal/domain/bug-comment.ts`) | new | да | `id`, `bugId`, `authorId`, `body: CommentBody`, `createdAt`, `editedAt \| null` | Комментарий к багу, правка автором в окне 15 минут |
| `Agent`, `Product` (`portal/domain/agent.ts`, `product.ts`) | existing, без изменений | да | `archivedAt`, `productIds`, `name` | Проверка агента и продукта при подаче |

### Aggregates
| Aggregate | Root entity | Входит в состав (entities/VO) | Инварианты, которые защищает |
|---|---|---|---|
| BugReport | `BugReport` | `BugTitle`, `BugDescription`, `BugStatus`, `WontFixReason` | Новый баг всегда `open`. Переходы только по `BUG_TRANSITIONS`. `wont_fix` ⇔ есть причина. `statusChangedAt ≥ createdAt`. Продукт, агент, автор не меняются |
| BugComment | `BugComment` | `CommentBody` | Как у `RequestComment`: текст валиден, правит только автор, окно 15 минут от `createdAt`, `bugId` не меняется |

### Value Objects
| Name | Поля | Почему VO (immutable/self-validating) |
|---|---|---|
| `BugTitle` (`portal/domain/bug-title.ts`, new) | `value` (trim, 1–200) | Самопроверка, 400 через `ArgumentInvalidError` |
| `BugDescription` (`portal/domain/bug-description.ts`, new) | `value` (trim по краям, переносы внутри, 1–4000) | То же |
| `WontFixReason` (`portal/domain/wont-fix-reason.ts`, new) | `value` (trim, 1–2000) | То же |
| `BugStatus` + `BugStatusPolicy` (`portal/domain/bug-status.ts`, new) | `'open' \| 'in_progress' \| 'resolved' \| 'wont_fix'`, `BUG_TRANSITIONS` | Единая таблица переходов для агрегата и `nextStatuses` |
| `BugAccessPolicy` (`portal/domain/bug-access-policy.ts`, new, чистая функция) | `canView(bug: { authorId }, actor: { id, roles })` | Автор или `developer` |
| `CommentBody`, `COMMENT_EDIT_WINDOW_MS`, `commentExcerpt` (existing) | — | Переиспользуются без изменений |
| `BugCommentAuthorRole` (`portal/domain/ports/bug-comment-query.port.ts`, new тип) | `'bug_author' \| 'developer'` | Роль автора комментария в баге |

### Services
| Service | Слой (application/domain/infrastructure) | Ответственность |
|---|---|---|
| `ReportBugUseCase` (new, `portal/application/report-bug.use-case.ts`) | application | Транзакция: `findAgentForShare` (404/409), `findProductsByIds` (404), членство (400) → VO → `BugReport.report` → `insert` → `BugReportedEvent`; после коммита `findView` |
| `ListMyBugsUseCase` (new, `list-my-bugs.use-case.ts`) | application | `BugQuery.listByAuthor(actorId, page)` |
| `ListBugQueueUseCase` (new, `list-bug-queue.use-case.ts`) | application | `BugQuery.listQueue(filter, page)` |
| `GetBugUseCase` (new, `get-bug.use-case.ts`) | application | `findView` → `BugAccessPolicy` (404) → `nextStatuses` по роли |
| `ChangeBugStatusUseCase` (new, `change-bug-status.use-case.ts`) | application | Транзакция: `findById` (404) → `WontFixReason` → `changeStatus` → `updateStatus(bug, expected)` (`false` → 409) → `BugStatusChangedEvent`; после коммита `findView` |
| `ListBugCommentsUseCase`, `PostBugCommentUseCase`, `EditBugCommentUseCase` (new, `list-bug-comments.use-case.ts`, `post-bug-comment.use-case.ts`, `edit-bug-comment.use-case.ts`) | application | Как use-case'ы ленты Э4, через `BugRepository.findById` и `BugAccessPolicy`; `BugCommentPostedEvent` |
| `BugView` / `toBugView` (new, `portal/application/bug-view.ts`) | application | `BugRecord` + `nextStatuses` |
| `BugRepository` / `SlonikBugRepository` (new, `domain/ports/bug-repository.port.ts`, `infrastructure/slonik-bug.repository.ts`) | port / infrastructure | `insert`, `findById`, `updateStatus(bug, expected): boolean` |
| `BugQuery` / `SlonikBugQuery` (new, `domain/ports/bug-query.port.ts`, `infrastructure/slonik-bug.query.ts`) | port / infrastructure | Read-модель: JOIN продукта, агента, автора и разработчика (ФИО), списки «мои» и очередь с порядком из design |
| `BugCommentRepository` / `SlonikBugCommentRepository` (new) | port / infrastructure | `insert`, `findById`, `update` над `portal_bug_comments` |
| `BugCommentQuery` / `SlonikBugCommentQuery` (new) | port / infrastructure | `listByBug`, `findView`, `authorRole` по `author_id` бага |
| `BugsController` (new, `interface/http/bugs.controller.ts`) + `bugs.schemas.ts`, `bugs.responses.ts` | interface | `POST /portal/bugs`, `GET /portal/bugs/my`, `GET /portal/bugs/queue`, `GET /portal/bugs/:id`, `POST /portal/bugs/:id/status` |
| `BugCommentsController` (new, `interface/http/bug-comments.controller.ts`) | interface | `GET`/`POST /portal/bugs/:id/comments`, `PATCH …/:commentId`; схемы и ответ комментария Э4 переиспользуются |
| `BugReportedEvent`, `BugStatusChangedEvent`, `BugCommentPostedEvent` (new, `portal/contracts/bug-*.event.ts`), `BUG_STATUS_LABELS` (`contracts/bug-status-labels.ts`) | contracts | События и подписи статусов; регистрация в `register-portal-events.ts` |
| `BugReportedRule`, `BugStatusChangedRule`, `BugCommentRule` (new, `notifications/domain/bug-*.rule.ts`) | domain (notifications) | Получатели и черновики `bug.*` |
| `BugReportedSubscriber`, `BugStatusChangedSubscriber`, `BugCommentPostedSubscriber` (new, `notifications/application/bug-*.subscriber.ts`) | application (notifications) | Имя инициатора, разработчики, создание уведомлений |
| `NotificationTarget`, `NotificationType` (existing, меняются) | domain (notifications) | + цель `bug`, + три типа |
| `portalBugUrl` (new, `telegram/domain/portal-bug-url.ts`), `notificationMessage` (existing, меняется) | domain / infrastructure (telegram) | «Открыть обращение» для цели `bug` |

### Method Signatures (ключевые, по каждому сервису)
| Service.Method | Params | Returns | Краткое описание |
|---|---|---|---|
| `BugStatusPolicy.nextStatuses` | `status: BugStatus` | `BugStatus[]` | По `BUG_TRANSITIONS` |
| `BugStatusPolicy.canTransition` | `from, to: BugStatus` | `boolean` | — |
| `BugReport.report` | `{ id, authorId, productId, agentId, title: BugTitle, description: BugDescription, now }` | `BugReport` | Статус `open`, `statusChangedAt = now` |
| `BugReport.restore` | все поля | `BugReport` | Из БД |
| `BugReport.changeStatus` | `to: BugStatus, by: string, reason: WontFixReason \| null, now: Date` | `BugStatus` (прежний) | `InvalidBugTransitionError`; `wont_fix` без причины → `ArgumentInvalidError` |
| `BugAccessPolicy.canView` | `bug: { authorId }, actor: { id, roles }` | `boolean` | Автор или `developer` |
| `BugComment.create` / `restore` / `canEdit` / `edit` | как у `RequestComment`, `bugId` вместо `requestId` | — | Ошибки комментариев Э4 |
| `ReportBugUseCase.execute` | `{ actorId, roles, title, description, productId, agentId }` | `BugView` | 400 / 404 / 409 |
| `ListMyBugsUseCase.execute` | `{ actorId, page: PageRequest }` | `Page<BugListRecord>` | От новых к старым |
| `ListBugQueueUseCase.execute` | `{ status: BugStatus \| null, page: PageRequest }` | `Page<BugListRecord>` | Порядок из design |
| `GetBugUseCase.execute` | `{ bugId, actorId, roles }` | `BugView` | 404 |
| `ChangeBugStatusUseCase.execute` | `{ bugId, actorId, roles, status: BugStatus, reason: string \| null }` | `BugView` | 400 / 404 / 409 |
| `ListBugCommentsUseCase.execute` | `{ bugId, actorId, roles }` | `BugCommentView[]` | 404 |
| `PostBugCommentUseCase.execute` | `{ bugId, actorId, roles, body }` | `BugCommentView` | 400 / 404 |
| `EditBugCommentUseCase.execute` | `{ bugId, commentId, actorId, roles, body }` | `BugCommentView` | 400 / 403 / 404 / 409 |
| `BugRepository.updateStatus` | `bug: BugReport, expected: BugStatus` | `Promise<boolean>` | Условный `UPDATE … WHERE status = expected` |
| `BugQuery.findView` | `id: string` | `BugRecord \| null` | Некорректный UUID → `null` |
| `BugQuery.listByAuthor` | `authorId, page` | `Page<BugListRecord>` | — |
| `BugQuery.listQueue` | `status \| null, page` | `Page<BugListRecord>` | — |
| `BugCommentQuery.listByBug` / `findView` | `bugId` / `id` | `BugCommentRecord[]` / `\| null` | `ORDER BY created_at, id` |
| `BugReportedRule.apply` | `event, authorName, developerIds` | `NotificationDraft[]` | Разработчики без автора |
| `BugStatusChangedRule.apply` | `event, developerName` | `NotificationDraft[]` | `[]`, если `changedBy === authorId` |
| `BugCommentRule.recipients` / `apply` | как у `RequestCommentRule` | `string[]` / `NotificationDraft[]` | — |
| `portalBugUrl` | `base, bugId` | `string` | `{base}/bugs/{encodeURIComponent(id)}` |

Новые ошибки в `portal/domain/errors.ts` и маппинг в `portal-error-status.ts`: `BugNotFoundError` (`PORTAL_BUG_NOT_FOUND` → 404), `InvalidBugTransitionError` (`PORTAL_BUG_INVALID_TRANSITION` → 409), `AgentNotInProductError` (`PORTAL_AGENT_NOT_IN_PRODUCT` → 400). Миграция: `backend/db/migrations/037_portal_bugs.sql`. Регистрация в `portal.module.ts` (два контроллера, восемь use-case'ов, четыре адаптера) и `notifications.module.ts` (три подписчика в `notification-event-subscriptions.ts`).

---

## Frontend — UI Model

### Pages
| Page | Route | Структура (ui / +model / +mediator) | Назначение |
|---|---|---|---|
| `NewBugPage` (new, `pages/NewBugPage.tsx`) | `/bugs/new?agentId=` | ui + `use-catalog.ts` (existing) | Форма бага; продукты и агенты из каталога, предвыбор по `agentId`; после успеха — `/bugs/:id` |
| `MyBugsPage` (new, `pages/MyBugsPage.tsx`) | `/bugs` | ui + `use-my-bugs.ts` | «Поддержка»: мои обращения и «Сообщить о проблеме» |
| `BugQueuePage` (new, `pages/BugQueuePage.tsx`) | `/bugs/queue` (`RequireRole developer`) | ui + `use-bug-queue.ts` | «Баги»: очередь с фильтром и страницами |
| `BugPage` (new, `pages/BugPage.tsx`) | `/bugs/:id` | ui + `use-bug.ts` | `BugDetails` + `BugStatusActions` (разработчику) + `CommentsSection subject="bugs"`; «Обращение не найдено» |
| `AgentPage` (existing, меняется) | `/catalog/agents/:id` | ui | + «Сообщить о проблеме» в слоте `actions` |
| `RequestPage` (existing, меняется) | `/requests/:id` | ui | `CommentsSection` с `subject="requests"` и `subjectId` |

### Features (переиспользуемые модули с бизнес-логикой)
| Feature | Статус (new/existing) | Публичный API (index.ts) | model/ (хуки, api.ts) | Назначение |
|---|---|---|---|---|
| `bugs` | new | `BugForm`, `BugList`, `BugQueueFilter`, `BugDetails`, `BugStatusActions`, `myBugsQuery`, `bugQueueQuery`, `bugQuery`, типы `Bug`, `BugStatus`, `BugQueueFilterValue` | `bugs.api.ts`, `bugs.schema.ts`, `bugs.queries.ts`, `use-report-bug.ts`, `use-change-bug-status.ts`, `bugs.errors.ts`, `bug-presentation.ts`, `bug-form.ts`, `bugs.fixtures.ts` | Подача, списки, экран бага, смена статуса |
| `comments` | existing, меняется | `CommentsSection` (props `subject`, `subjectId`) | `comments.api.ts` (путь по `subject`), `comments.schema.ts` (+ `bug_author`), `comments.queries.ts` (ключ с `subject`), мутации | Лента для заявки и бага |
| `shell` | existing, меняется | `NavMenu` | — | + «Поддержка», «Баги» |

### UI-компоненты (page-local и shared)
| Component | Расположение (features/<f>/ui · components/ui · pages) | Props (основные) | Назначение |
|---|---|---|---|
| `BugForm` (new) | `features/bugs/ui/BugForm.tsx` | `products: CatalogProductOption[]`, `initialAgentId?: string`, `onReported(id)` | Поля продукта, агента, названия, подробностей; валидация; отправка |
| `BugList` (new) | `features/bugs/ui/BugList.tsx` | `items: BugListItem[]`, `showAuthor: boolean`, пагинация | Таблица на 1440, карточки на 360 |
| `BugQueueFilter` (new) | `features/bugs/ui/BugQueueFilter.tsx` | `value`, `onChange` | Переключатель «Незакрытые / Открыт / В работе / Исправлен / Не будет исправлен» |
| `BugDetails` (new) | `features/bugs/ui/BugDetails.tsx` | `bug: Bug`, слоты `actions?: ReactNode`, `comments?: ReactNode` | Шапка со статусом, продукт и агент (ссылка), автор, дата, описание, причина `wont_fix` |
| `BugStatusBadge` (new) | `features/bugs/ui/BugStatusBadge.tsx` | `status` | `Badge` с тоном по статусу |
| `BugStatusActions` (new) | `features/bugs/ui/BugStatusActions.tsx` | `bug: Bug` | Кнопки по `nextStatuses`, сообщения 409 |
| `WontFixDialog` (new, внутренний) | `features/bugs/ui/WontFixDialog.tsx` | `open`, `onConfirm(reason)`, `onClose`, `pending` | Причина 1–2000, подсказка про повтор |
| `CommentsSection`, `CommentItem` (existing, меняются) | `features/comments/ui/` | `subject`, `subjectId` | Подпись роли «Автор обращения» |
| `Button`, `Badge`, `Select`, `Input`, `Textarea`, `FormField`, `Table`, `Pagination`, `Dialog`, `Alert`, `PersonAvatar` (existing) | `components/ui` | — | Переиспользуются |

### Hooks (model)
| Hook | Расположение | Тип (state-хук / query options factory) | Возвращает |
|---|---|---|---|
| `myBugsQuery(page)` | `features/bugs/model/bugs.queries.ts` | query options factory | `[...BUGS_KEY, 'my', page]` |
| `bugQueueQuery(filter, page)` | там же | query options factory | `[...BUGS_KEY, 'queue', filter, page]`, `placeholderData: keepPreviousData` |
| `bugQuery(id)` | там же | query options factory | `[...BUGS_KEY, 'detail', id]` |
| `useReportBug()` | `features/bugs/model/use-report-bug.ts` | мутация | При успехе инвалидирует `my` и кладёт баг в `detail` |
| `useChangeBugStatus(id)` | `features/bugs/model/use-change-bug-status.ts` | мутация | При успехе обновляет `detail` и инвалидирует списки; 409 → инвалидирует `detail` |
| `useBugForm(products, initialAgentId)` | `features/bugs/model/bug-form.ts` | state-хук над чистыми функциями | Значения, ошибки, агенты выбранного продукта |
| `use-my-bugs.ts`, `use-bug-queue.ts`, `use-bug.ts` | `pages/` | page-хуки | `isInitialLoad` / `isRefreshing`, как существующие `use-queue.ts`, `use-request.ts` |

`lib/query-keys.ts` — `BUGS_KEY`. `lib/status-labels.ts` — подписи статусов бага, если общий модуль подписей уже там.

### Паттерны, которые нужно учесть при проектировании
- [x] Публичный API фичи только через `index.ts`
- [x] Запросы к backend — через query options factory в `model/bugs.queries.ts`, мутации — `use-*.ts`
- [x] Ошибки API нормализуются через `ApiError`, ветвление по `code`: `PORTAL_BUG_NOT_FOUND`, `PORTAL_BUG_INVALID_TRANSITION`, `PORTAL_AGENT_NOT_IN_PRODUCT`, `PORTAL_AGENT_ARCHIVED`
- [ ] `mediator/` не нужен: `BugPage` связывает три виджета слотами `BugDetails`, они не зависят друг от друга
- [x] Именованные слоты: `BugDetails` — `actions` и `comments`, по образцу `RequestDetails`
- [x] `isInitialLoad` / `isRefreshing`: смена фильтра и страницы очереди не схлопывает список
- [x] Новых общих компонентов нет, цвета — токенами

---

## Diagrams

Как и в прошлых change Featurer, диаграммы описаны текстом, в Miro не переносятся.

### 1. Domain Entity Interaction
`Product 1—* BugReport *—1 Agent` (по `productId`, `agentId`; пара проверяется при подаче по `Agent.productIds`, внешнего ключа на связь нет). `BugReport 1—* BugComment` (по `bugId`, `ON DELETE CASCADE`). `BugReport` содержит `BugTitle`, `BugDescription`, `BugStatus`, `WontFixReason?`. `BugComment` содержит `CommentBody` (общий с `RequestComment`). `BugReport.authorId`, `statusChangedBy`, `BugComment.authorId → auth_users`. Заявки и навыки с багом не связаны.

### 2. External Modules Interaction
Портал → `POST/GET /portal/bugs…`, `GET/POST/PATCH /portal/bugs/:id/comments…` (опрос ленты раз в 30 с, как в Э4). `portal` → `auth` (guard, роли из access-токена). `portal` → outbox в той же транзакции (`BugReportedEvent`, `BugStatusChangedEvent`, `BugCommentPostedEvent`) → `notifications` асинхронно (подписчик → `UserDirectoryPort.findFullNameById`, `listActiveDeveloperIds` → правило → `CreateNotificationsUseCase`) → каналы: realtime (control-center и manager-helper показывают уведомление, без перехода) и `telegram` (`notificationMessage` + «Открыть обращение» `PORTAL_PUBLIC_URL/bugs/:id`).

### 3. Layer Interaction — от Controller до Response
`BugsController.report` → Zod → `ReportBugUseCase` → транзакция: `CatalogRepository.findAgentForShare` (нет → `AgentNotFoundError` 404, архив → `AgentArchivedError` 409) → `findProductsByIds` (нет → `ProductNotFoundError` 404) → членство (нет → `AgentNotInProductError` 400) → `BugTitle.of`, `BugDescription.of` (400) → `BugReport.report` → `BugRepository.insert` → `publish(BugReportedEvent)` → commit → `BugQuery.findView` → `toBugView` → 201.

`BugsController.changeStatus` (`@Roles('developer')`) → Zod (`status ∈ BUG_STATUSES`, `reason?`) → `ChangeBugStatusUseCase` → транзакция: `BugRepository.findById` (нет → `BugNotFoundError` 404) → `WontFixReason.of` (400) → `bug.changeStatus` (`InvalidBugTransitionError` 409) → `updateStatus(bug, expected)` (`false` → 409) → `publish(BugStatusChangedEvent)` → commit → `findView` → 200.

`BugsController.get` → `GetBugUseCase` → `BugQuery.findView` (нет → 404) → `BugAccessPolicy.canView` (нет → 404) → `nextStatuses` по роли → 200. Лента — как в Э4 с `BugRepository` и `BugAccessPolicy`. Ошибки маппятся через `registerPortalErrorStatuses`.

---

## Confirmation Checklist
- [x] Названия entity/aggregate/VO согласованы
- [x] Названия и сигнатуры ключевых методов сервисов согласованы
- [x] Слои (pages/features/components), структура model/ui и паттерны фронта согласованы
- [x] Диаграммы взаимодействия: текстовое описание, как в прошлых change
- [x] Пользователь подтвердил переход к tasks.md
