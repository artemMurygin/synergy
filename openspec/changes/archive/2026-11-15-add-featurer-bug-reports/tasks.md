## 1. portal (backend), домен бага: миграция 037, VO, политика статусов, `BugReport`
> track: backend
> depends: —
> specs: featurer-bug-reports → «Подача бага»; featurer-bug-reports → «Поля бага»; featurer-bug-reports → «Доступ к багу»; featurer-bug-reports → «Жизненный цикл бага»
> arch: Entities/BugReport; Aggregates/BugReport; Value Objects/BugTitle; Value Objects/BugDescription; Value Objects/WontFixReason; Value Objects/BugStatus + BugStatusPolicy; Value Objects/BugAccessPolicy; Services/BugRepository; Services/BugQuery
> files: backend/db/migrations/037_portal_bugs.sql; backend/src/modules/portal/domain/bug-*.ts; backend/src/modules/portal/domain/wont-fix-reason.ts; backend/src/modules/portal/domain/errors.ts; backend/src/modules/portal/domain/ports/bug-repository.port.ts; backend/src/modules/portal/domain/ports/bug-query.port.ts; backend/src/modules/portal/interface/portal-error-status.ts
> frames: —

- [x] 1.1 Миграция `037_portal_bugs.sql`: таблицы `portal_bugs` и `portal_bug_comments`, CHECK и индексы по design.md §1, в шапке — комментарий с откатом. Без тестов: SQL, проверяется ревью и прогоном миграций в группе 14
- [x] 1.2 TDD: `BugTitle` (trim, 1–200), `BugDescription` (trim по краям, переносы внутри, 1–4000), `WontFixReason` (trim, 1–2000) — `ArgumentInvalidError` при нарушении. Тесты: backend/src/modules/portal/domain/bug-text.spec.ts. Реализация: domain/bug-title.ts, bug-description.ts, wont-fix-reason.ts
- [x] 1.3 TDD: `BugStatusPolicy` — `BUG_TRANSITIONS` ровно по спеке (`open→in_progress|wont_fix`, `in_progress→resolved|wont_fix|open`, `resolved|wont_fix→in_progress`), `nextStatuses`, `canTransition`; `BugAccessPolicy.canView` (автор или `developer`). Тесты: domain/bug-status.spec.ts, domain/bug-access-policy.spec.ts. Реализация: domain/bug-status.ts, bug-access-policy.ts
- [x] 1.4 TDD: агрегат `BugReport` — `report` даёт `open`; `changeStatus` по политике, недопустимый переход → `InvalidBugTransitionError`, `wont_fix` без причины → `ArgumentInvalidError`, причина только у `wont_fix`, записывает `statusChangedBy`/`statusChangedAt`, возвращает прежний статус; `restore`. Тесты: domain/bug-report.spec.ts. Реализация: domain/bug-report.ts
- [x] 1.5 Ошибки `BugNotFoundError` (`PORTAL_BUG_NOT_FOUND` → 404), `InvalidBugTransitionError` (`PORTAL_BUG_INVALID_TRANSITION` → 409), `AgentNotInProductError` (`PORTAL_AGENT_NOT_IN_PRODUCT` → 400) в `errors.ts` и маппинг в `portal-error-status.ts`; порты `BugRepository` (`insert`, `findById`, `updateStatus(bug, expected): boolean`) и `BugQuery` (`findView`, `listByAuthor`, `listQueue`, типы `BugRecord`, `BugListRecord`). TDD на маппинг: тест в существующем spec маппинга ошибок портала (дописать кейсы). Готово, когда тесты green и typecheck проходит

## 2. portal (backend), домен комментария к багу и события
> track: backend
> depends: 1
> specs: featurer-bug-comments → «Правка своего комментария к багу»; featurer-bug-comments → «Событие о новом комментарии к багу в outbox»; featurer-bug-reports → «События по багам в outbox»
> arch: Entities/BugComment; Aggregates/BugComment; Value Objects/BugCommentAuthorRole; Services/BugCommentRepository; Services/BugCommentQuery; Services/BugReportedEvent, BugStatusChangedEvent, BugCommentPostedEvent
> files: backend/src/modules/portal/domain/bug-comment.ts; backend/src/modules/portal/domain/ports/bug-comment-*.port.ts; backend/src/modules/portal/contracts/bug-*.ts; backend/src/modules/portal/contracts/register-portal-events.ts
> frames: —

- [x] 2.1 TDD: `BugComment` — `create`/`restore`/`canEdit`/`edit` с `CommentBody` и `COMMENT_EDIT_WINDOW_MS` из Э4: чужой → `CommentNotOwnedError`, после 15 минут → `CommentEditWindowExpiredError`, окно от `createdAt` не продлевается. Тесты: domain/bug-comment.spec.ts. Реализация: domain/bug-comment.ts (код Э4 не менять)
- [x] 2.2 Порты `BugCommentRepository` (`insert`, `findById`, `update`) и `BugCommentQuery` (`listByBug`, `findView`, тип `BugCommentRecord` с `authorRole: 'bug_author' | 'developer'`). Без тестов: только интерфейсы
- [x] 2.3 TDD: события `BugReportedEvent` (`portal.bug_reported`), `BugStatusChangedEvent` (`portal.bug_status_changed`), `BugCommentPostedEvent` (`portal.bug_comment_posted`, `excerpt = commentExcerpt(body)` ≤ 200) с payload по design.md §5, `BUG_STATUS_LABELS`; регистрация в `register-portal-events.ts`. Тесты: contracts/bug-events.spec.ts (payload, обрезка, регистрация). Реализация: contracts/bug-reported.event.ts, bug-status-changed.event.ts, bug-comment-posted.event.ts, bug-status-labels.ts

## 3. portal (backend), Slonik-адаптеры багов и комментариев
> track: backend
> depends: 1, 2
> specs: featurer-bug-reports → «Поля бага»; featurer-bug-reports → «Мои обращения»; featurer-bug-reports → «Очередь багов разработчика»; featurer-bug-reports → «Жизненный цикл бага»; featurer-bug-comments → «Лента комментариев бага»
> arch: Services/BugRepository; Services/BugQuery; Services/BugCommentRepository; Services/BugCommentQuery
> files: backend/src/modules/portal/infrastructure/slonik-bug.repository.ts; slonik-bug.query.ts; slonik-bug-comment.repository.ts; slonik-bug-comment.query.ts (+ *.spec.ts)
> frames: —

- [x] 3.1 TDD: `SlonikBugRepository` — `insert`, `findById` (некорректный UUID → `null`), `updateStatus` с `WHERE status = expected` возвращает `false` при гонке. Тесты: infrastructure/slonik-bug.repository.spec.ts (по образцу существующих spec адаптеров портала). Реализация: infrastructure/slonik-bug.repository.ts
- [x] 3.2 TDD: `SlonikBugQuery` — `findView` с JOIN продукта, агента (в т. ч. архивного), автора и `statusChangedBy` (ФИО по правилам `employee-directory`); `listByAuthor` от новых к старым с `total`; `listQueue`: без фильтра `open`+`in_progress`, сначала `open`, по `created_at`; `resolved`/`wont_fix` — по `status_changed_at DESC`. Тесты: infrastructure/slonik-bug.query.spec.ts. Реализация: infrastructure/slonik-bug.query.ts
- [x] 3.3 TDD: `SlonikBugCommentRepository` и `SlonikBugCommentQuery` — вставка, правка, лента `ORDER BY created_at, id`, `authorRole` по `author_id` бага, комментарии заявок не попадают. Тесты: infrastructure/slonik-bug-comment.spec.ts. Реализация: infrastructure/slonik-bug-comment.repository.ts, slonik-bug-comment.query.ts

## 4. portal (backend), use-case'ы багов
> track: backend
> depends: 1, 2
> specs: featurer-bug-reports → «Подача бага»; featurer-bug-reports → «Доступ к багу»; featurer-bug-reports → «Мои обращения»; featurer-bug-reports → «Очередь багов разработчика»; featurer-bug-reports → «Жизненный цикл бага»; featurer-bug-reports → «События по багам в outbox»
> arch: Services/ReportBugUseCase; Services/ListMyBugsUseCase; Services/ListBugQueueUseCase; Services/GetBugUseCase; Services/ChangeBugStatusUseCase; Services/BugView
> files: backend/src/modules/portal/application/report-bug.use-case.ts; list-my-bugs.use-case.ts; list-bug-queue.use-case.ts; get-bug.use-case.ts; change-bug-status.use-case.ts; bug-view.ts; test-doubles.ts (+ *.spec.ts)
> frames: —

- [x] 4.1 TDD: `ReportBugUseCase` — в транзакции `findAgentForShare` (нет → 404, архив → 409), `findProductsByIds` (нет → 404), агент не в продукте → 400, VO → `insert` → `BugReportedEvent` с названиями продукта и агента; ошибка публикации откатывает вставку. Тесты: application/report-bug.use-case.spec.ts. Реализация: application/report-bug.use-case.ts
- [x] 4.2 TDD: `GetBugUseCase` и `toBugView` — чужой без `developer` → `BugNotFoundError`, `nextStatuses` пуст для не-разработчика и по политике для разработчика. Тесты: application/get-bug.use-case.spec.ts. Реализация: application/get-bug.use-case.ts, bug-view.ts
- [x] 4.3 TDD: `ListMyBugsUseCase` и `ListBugQueueUseCase` передают автора, фильтр и страницу в `BugQuery`. Тесты: application/list-bugs.use-cases.spec.ts. Реализация: application/list-my-bugs.use-case.ts, list-bug-queue.use-case.ts
- [x] 4.4 TDD: `ChangeBugStatusUseCase` — 404 для неизвестного, 400 для `wont_fix` без причины, 409 для недопустимого перехода и для `updateStatus → false`, событие с `from`, `to`, `reason` в той же транзакции. Тесты: application/change-bug-status.use-case.spec.ts. Реализация: application/change-bug-status.use-case.ts

## 5. portal (backend), лента комментариев бага: use-case'ы и контроллер
> track: backend
> depends: 2
> specs: featurer-bug-comments → «Доступ к ленте комментариев бага»; featurer-bug-comments → «Лента комментариев бага»; featurer-bug-comments → «Добавление комментария к багу»; featurer-bug-comments → «Правка своего комментария к багу»; featurer-bug-comments → «Событие о новом комментарии к багу в outbox»
> arch: Services/ListBugCommentsUseCase, PostBugCommentUseCase, EditBugCommentUseCase; Services/BugCommentsController
> files: backend/src/modules/portal/application/list-bug-comments.use-case.ts; post-bug-comment.use-case.ts; edit-bug-comment.use-case.ts; bug-comment-view.ts; backend/src/modules/portal/interface/http/bug-comments.controller.ts (+ *.spec.ts)
> frames: —

- [x] 5.1 TDD: `ListBugCommentsUseCase` и `PostBugCommentUseCase` — баг не найден или чужой → 404, `CommentBody` → 400, `insert` + `BugCommentPostedEvent` в транзакции, `canEdit` по часам. Тесты: application/bug-comments.use-cases.spec.ts. Реализация: application/list-bug-comments.use-case.ts, post-bug-comment.use-case.ts, bug-comment-view.ts
- [x] 5.2 TDD: `EditBugCommentUseCase` — комментарий другого бага → 404, чужой → 403, после 15 минут → 409, без события. Тесты: application/edit-bug-comment.use-case.spec.ts. Реализация: application/edit-bug-comment.use-case.ts
- [x] 5.3 TDD: `BugCommentsController` на `portal/bugs/:id/comments` (`GET`, `POST` 201, `PATCH :commentId`) без `@Roles`, схемы и формат ответа комментария Э4 с ролью `bug_author`. Тесты: interface/http/bug-comments.controller.spec.ts (по образцу `comments.controller.spec.ts`). Реализация: interface/http/bug-comments.controller.ts

## 6. portal (backend), HTTP багов и регистрация в модуле
> track: backend
> depends: 3, 4, 5
> specs: featurer-bug-reports → «Подача бага»; featurer-bug-reports → «Поля бага»; featurer-bug-reports → «Доступ к багу»; featurer-bug-reports → «Мои обращения»; featurer-bug-reports → «Очередь багов разработчика»; featurer-bug-reports → «Жизненный цикл бага»
> arch: Services/BugsController
> files: backend/src/modules/portal/interface/http/bugs.controller.ts; bugs.schemas.ts; bugs.responses.ts (+ *.spec.ts); backend/src/modules/portal/portal.module.ts; backend/src/modules/portal/infrastructure/slonik-catalog.repository.ts; sql-helpers.ts; slonik-*.ts; postgres-portal.repositories.spec.ts
> frames: —

- [x] 6.1 TDD: `bugs.schemas.ts` (подача с грубыми верхними границами, `status ∈ BUG_STATUSES`, `reason?`, фильтр очереди + страница; недопустимый фильтр → 400) и `bugs.responses.ts` (`BugResponse`, `BugListItem` по design.md §4). Тесты: interface/http/bugs.schemas.spec.ts. Реализация: interface/http/bugs.schemas.ts, bugs.responses.ts
- [x] 6.2 TDD: `BugsController` — `POST /portal/bugs` 201, `GET /portal/bugs/my`, `GET /portal/bugs/queue` (`@Roles('developer')`, 403 сотруднику), `GET /portal/bugs/:id`, `POST /portal/bugs/:id/status` (`@Roles('developer')`); маршруты `my` и `queue` объявлены до `:id`; 401 без токена. Тесты: interface/http/bugs.controller.spec.ts (http-fixture). Реализация: interface/http/bugs.controller.ts
- [x] 6.3 Регистрация `BugsController`, `BugCommentsController`, восьми use-case'ов и четырёх адаптеров в `portal.module.ts`. Проверка: `npm run typecheck` и тесты модуля портала green
- [x] 6.4 TDD (замечание ревью, major): некорректный не-UUID `productId`/`agentId` в `POST /portal/bugs` даёт 404, а не 500. Репозиторные тесты на реальной БД: `SlonikCatalogRepository.findProductsByIds(['x'])` → `[]`, `findAgentForShare('x')` → `null` (по образцу «findById: некорректный UUID и неизвестный id дают null» в postgres-portal.repositories.spec.ts); тест use case или контроллера без мока use case для `agentId='x'` и `productId='x'` → 404. По возможности вынести дублированную `UUID_PATTERN` из адаптеров портала в `infrastructure/sql-helpers.ts`. Тесты: backend/src/modules/portal/infrastructure/postgres-portal.repositories.spec.ts, interface/http/bugs.controller.spec.ts. Реализация: infrastructure/slonik-catalog.repository.ts, sql-helpers.ts

## 7. notifications, уведомления о багах
> track: backend
> depends: 2
> specs: notifications → «Поля уведомления»; notifications → «Уведомление разработчиков о новом баге»; notifications → «Уведомление автора о смене статуса бага»; notifications → «Уведомление о новом комментарии к багу»; notifications → «Доставка уведомлений о багах по каналам»
> arch: Services/BugReportedRule, BugStatusChangedRule, BugCommentRule; Services/BugReportedSubscriber, BugStatusChangedSubscriber, BugCommentPostedSubscriber; Services/NotificationTarget, NotificationType
> files: backend/src/modules/notifications/domain/notification-target.ts; notification-type.ts; bug-*.rule.ts; backend/src/modules/notifications/application/bug-*.subscriber.ts; notification-event-subscriptions.ts; backend/src/modules/notifications/notifications.module.ts (+ *.spec.ts)
> frames: —

- [x] 7.1 TDD: цель `bug` в `NOTIFICATION_TARGET_TYPES`, типы `bug.reported`, `bug.status-changed`, `bug.comment-added` в `NOTIFICATION_TYPES`. Тесты: domain/notification-target.spec.ts, notification-type.spec.ts (дописать). Реализация: domain/notification-target.ts, notification-type.ts
- [x] 7.2 TDD: `BugReportedRule` (разработчики без автора, заголовок «Новый баг: …», текст с именем, продуктом, агентом) и `BugStatusChangedRule` (`[]`, если `changedBy === authorId`; подпись статуса из `BUG_STATUS_LABELS`, причина для `wont_fix`). Тесты: domain/bug-reported.rule.spec.ts, bug-status-changed.rule.spec.ts. Реализация: domain/bug-reported.rule.ts, bug-status-changed.rule.ts
- [x] 7.3 TDD: `BugCommentRule` — `recipients` (автор пишет → разработчики без него, иначе → автор бага) и `apply`. Тесты: domain/bug-comment.rule.spec.ts. Реализация: domain/bug-comment.rule.ts
- [x] 7.4 TDD: три подписчика по образцу `RequestCommentPostedSubscriber` (`findFullNameById`, `null` → `NotificationActorNotFoundError`; разработчики только где нужны; пустой список — успех), регистрация в `notification-event-subscriptions.ts`; повторная обработка не дублирует. Тесты: application/bug-subscribers.spec.ts, notification-event-subscriptions.spec.ts. Реализация: application/bug-reported.subscriber.ts, bug-status-changed.subscriber.ts, bug-comment-posted.subscriber.ts

## 8. telegram, ссылка «Открыть обращение»
> track: backend
> depends: 7
> specs: telegram-notifications → «Ссылка на баг в сообщении»
> arch: Services/portalBugUrl, notificationMessage
> files: backend/src/modules/telegram/domain/portal-bug-url.ts; backend/src/modules/telegram/infrastructure/telegram/messenger.channel.ts (+ *.spec.ts)
> frames: —

- [x] 8.1 TDD: `portalBugUrl(base, id)` кодирует id; `notificationMessage` для цели `bug` добавляет `<a href="…/bugs/…">Открыть обращение</a>`, для `request` — прежняя ссылка, для `task`/`chat` и без `portalUrl` — сообщение байт в байт прежнее. Тесты: domain/portal-bug-url.spec.ts, infrastructure/telegram/messenger.channel.spec.ts (дописать). Реализация: domain/portal-bug-url.ts, messenger.channel.ts

## 9. portal (frontend), лента комментариев для заявки и бага
> track: portal
> depends: —
> specs: featurer-bug-reports-ui → «Экран бага»; featurer-portal-ui → «Комментарии на экране заявки»
> arch: Features/comments; UI-компоненты/CommentsSection, CommentItem; Pages/RequestPage
> files: portal/src/features/comments/**; portal/src/pages/RequestPage.tsx; portal/src/pages/RequestPage.test.tsx
> frames: RXMHC; SFgNl

- [x] 9.1 TDD: `CommentsSection` принимает `subject: 'requests' | 'bugs'` и `subjectId` (вместо `requestId`); API строит `/portal/${subject}/${id}/comments`, ключ кеша включает `subject`; схема роли `request_author | bug_author | developer`, подпись «Автор обращения» тем же нейтральным тоном, что «Автор заявки». Тесты: features/comments/model/comments.test.tsx, ui/CommentsSection.test.tsx, ui/CommentItem.test.tsx (дописать кейсы бага). Реализация: features/comments/model/*, ui/CommentsSection.tsx, CommentItem.tsx. Сверка подписи роли с фреймом `RXMHC` (комментарии `mQiLI`)
- [x] 9.2 `RequestPage` передаёт `subject="requests"` и `subjectId`. Проверка: существующие `RequestPage.test.tsx` и тесты фичи `comments` green, typecheck

## 10. portal (frontend), фича `bugs`: модель
> track: portal
> depends: —
> specs: featurer-bug-reports-ui → «Форма «Сообщить о проблеме»»; featurer-bug-reports-ui → «Очередь багов»; featurer-bug-reports-ui → «Действия разработчика на экране бага»
> arch: Features/bugs; Hooks/myBugsQuery; Hooks/bugQueueQuery; Hooks/bugQuery; Hooks/useReportBug; Hooks/useChangeBugStatus; Hooks/useBugForm
> files: portal/src/features/bugs/model/**; portal/src/features/bugs/index.ts; portal/src/lib/query-keys.ts
> frames: —

- [x] 10.1 TDD: Zod-схемы `BugResponse`, `BugListItem`, страница списка — по контракту design.md §4 (разбирают фикстуры `bugs.fixtures.ts`, собранные из формата `bugs.responses.ts`); `bugs.api.ts` (`reportBug`, `listMyBugs`, `listBugQueue`, `getBug`, `changeBugStatus`). Тесты: features/bugs/model/bugs.api.test.ts. Реализация: model/bugs.schema.ts, bugs.api.ts, bugs.fixtures.ts
- [x] 10.2 TDD: `bugs.queries.ts` (`myBugsQuery`, `bugQueueQuery` с `keepPreviousData`, `bugQuery`), мутации `useReportBug` и `useChangeBugStatus` (успех обновляет `detail` и инвалидирует списки; 409 инвалидирует `detail`), `bugs.errors.ts` (сообщения по `PORTAL_BUG_INVALID_TRANSITION`, `PORTAL_AGENT_ARCHIVED`, `PORTAL_AGENT_NOT_IN_PRODUCT`, `PORTAL_BUG_NOT_FOUND`). Тесты: model/bugs.queries.test.tsx. Реализация: model/bugs.queries.ts, use-report-bug.ts, use-change-bug-status.ts, bugs.errors.ts; `BUGS_KEY` в lib/query-keys.ts
- [x] 10.3 TDD: `bug-form.ts` — агенты выбранного продукта без архивных, сброс агента при смене продукта, предвыбор по `agentId` (один продукт → выбран; несколько → только продукты агента; неизвестный → игнор), проверки обязательности и пределов 200/4000; `bug-presentation.ts` — подписи и тоны статусов (у «Открыт» текст `ink-80`, см. ui-design «Отклонения» п. 2). Тесты: model/bug-form.test.ts, model/bug-presentation.test.ts. Реализация: model/bug-form.ts, bug-presentation.ts

## 11. portal (frontend), «Сообщить о проблеме» и «Поддержка»
> track: portal
> depends: 10
> specs: featurer-bug-reports-ui → «Форма «Сообщить о проблеме»»; featurer-bug-reports-ui → «Мои обращения»
> arch: Pages/NewBugPage; Pages/MyBugsPage; UI-компоненты/BugForm; UI-компоненты/BugList; UI-компоненты/BugStatusBadge
> files: portal/src/features/bugs/ui/BugForm.tsx; BugList.tsx; BugStatusBadge.tsx (+ *.test.tsx); portal/src/pages/NewBugPage.tsx; MyBugsPage.tsx; use-my-bugs.ts (+ *.test.tsx)
> frames: B6ODY; XCnCr; mNNIU; YPHfA; yng7h; ULAhT; FHS21; Evurv; e1Zr5f; kGdVz; VEOdq; SEMML; LuTBN

> Повторный прогон: код и тесты групп 11–12 уже есть. Цель — скриншотная сверка каждого экрана с указанными фреймами в браузере (маршруты `/bugs`, `/bugs/new`, `/bugs/:id` зарегистрированы в группе 13; запуск как в группе 14: бэкенд на порту 3100 с `AUTH_ALLOWED_ORIGINS=http://localhost:5180`, vite портала на 5180 с `VITE_API_URL=http://localhost:3100`, данные на локальной БД 5432) и исправление расхождений с тестом там, где меняется логика. Задача считается выполненной только после сверки скриншотом.

- [x] 11.1 TDD: `BugForm` — поле «Агент» недоступно до выбора продукта, ошибки у полей, кнопка недоступна при отправке, 409 показывает `Alert` и очищает агента с сохранением текста. Тесты: features/bugs/ui/BugForm.test.tsx. Вёрстка по фреймам `B6ODY`, `YPHfA`, `yng7h`, `ULAhT`, сверка с макетом в этой же задаче
- [x] 11.2 TDD: `NewBugPage` (`/bugs/new?agentId=`) берёт продукты из `use-catalog.ts`, предвыбирает агента, после успеха ведёт на `/bugs/:id`. Тесты: pages/NewBugPage.test.tsx. Вёрстка по фреймам `XCnCr` (1440 из карточки агента) и `mNNIU` (360)
- [x] 11.3 TDD: `BugStatusBadge` (тоны по `LuTBN`, `className="text-ink-80"` для «Открыт», общий `Badge` не меняется), `BugList` (таблица 1440, карточки 360, колонка автора по флагу, пагинация) и `MyBugsPage` (`/bugs`: «Сообщить о проблеме», пустое состояние, скелет первой загрузки, ошибка с «Повторить»). Тесты: ui/BugList.test.tsx, pages/MyBugsPage.test.tsx. Вёрстка по фреймам `FHS21`, `Evurv`, `e1Zr5f`, `kGdVz`, `VEOdq`, `SEMML`

## 12. portal (frontend), экран бага и действия разработчика
> track: portal
> depends: 9, 10
> specs: featurer-bug-reports-ui → «Экран бага»; featurer-bug-reports-ui → «Действия разработчика на экране бага»
> arch: Pages/BugPage; UI-компоненты/BugDetails; UI-компоненты/BugStatusActions; UI-компоненты/WontFixDialog
> files: portal/src/features/bugs/ui/BugDetails.tsx; BugStatusActions.tsx; WontFixDialog.tsx (+ *.test.tsx); portal/src/pages/BugPage.tsx; use-bug.ts; BugPage.test.tsx
> frames: RXMHC; X4232n; SFgNl; F7L8G; lUeNl; p1xLSJ; bQ9C2; IQ09F; LCYiw; kc6Fg

> Повторный прогон: код и тесты групп 11–12 уже есть. Цель — скриншотная сверка каждого экрана с указанными фреймами в браузере (маршруты `/bugs`, `/bugs/new`, `/bugs/:id` зарегистрированы в группе 13; запуск как в группе 14: бэкенд на порту 3100 с `AUTH_ALLOWED_ORIGINS=http://localhost:5180`, vite портала на 5180 с `VITE_API_URL=http://localhost:3100`, данные на локальной БД 5432) и исправление расхождений с тестом там, где меняется логика. Задача считается выполненной только после сверки скриншотом.

- [x] 12.1 TDD: `BugDetails` — статус, продукт, агент ссылкой (если не в архиве), автор, дата, описание как текст с переносами, причина для `wont_fix`, слоты `actions` и `comments`. Тесты: features/bugs/ui/BugDetails.test.tsx. Вёрстка по фреймам `RXMHC` (1440) и `SFgNl` (360)
- [x] 12.2 TDD: `BugStatusActions` — кнопки только по `nextStatuses` («Взять в работу», «Исправлен», «Не будет исправлен», «Вернуть в очередь», «Переоткрыть»), недоступны во время запроса, 409 → `Alert` «Статус бага уже изменился»; `WontFixDialog` — причина 1–2000, подтверждение недоступно при пустой. Тесты: ui/BugStatusActions.test.tsx, ui/WontFixDialog.test.tsx. Вёрстка по фреймам `X4232n` (блок `BvkYa`), `F7L8G`, `lUeNl`, `p1xLSJ`, `bQ9C2`, `LCYiw`, `kc6Fg`
- [x] 12.3 TDD: `BugPage` (`/bugs/:id`) связывает `BugDetails`, `BugStatusActions` (только `developer`) и `CommentsSection subject="bugs"`; 404 и неверный id → «Обращение не найдено» со ссылкой на «Поддержку». Тесты: pages/BugPage.test.tsx. Вёрстка по фреймам `RXMHC`, `X4232n`, `IQ09F`

## 13. portal (frontend), очередь багов, маршруты, меню, карточка агента
> track: portal
> depends: 10, 11, 12
> specs: featurer-bug-reports-ui → «Очередь багов»; featurer-bug-reports-ui → «Сообщить о проблеме из карточки агента»; featurer-portal-ui → «Видимость разделов по роли»
> arch: Pages/BugQueuePage; Pages/AgentPage; UI-компоненты/BugQueueFilter; Features/shell
> files: portal/src/features/bugs/ui/BugQueueFilter.tsx (+ test); portal/src/pages/BugQueuePage.tsx; use-bug-queue.ts; BugQueuePage.test.tsx; portal/src/router.tsx; portal/src/features/shell/NavMenu.tsx; NavMenu.test.tsx; portal/src/pages/AgentPage.tsx; AgentPage.test.tsx
> frames: zxJ1Y; cEbUO; lqJTl; W6KTfj; brYq4; j6jg1B; n9o2T

- [x] 13.1 TDD: `BugQueueFilter` (группа кнопок с `aria-pressed`, по умолчанию «Незакрытые») и `BugQueuePage` (`/bugs/queue`): смена фильтра сбрасывает страницу и не показывает скелет поверх списка, пустая выборка с подсказкой. Тесты: ui/BugQueueFilter.test.tsx, pages/BugQueuePage.test.tsx. Вёрстка по фреймам `zxJ1Y`, `cEbUO`
- [x] 13.2 TDD: маршруты `/bugs`, `/bugs/new`, `/bugs/queue` (под `RequireRole developer`), `/bugs/:id` (статичные до `:id`); `NavMenu` — «Поддержка» после «Роадмап» для всех, «Баги» после «Навыки» у разработчика, «Поддержка» не активна на `/bugs/queue`, промежуток пунктов шапки разработчика 24 (ui-design «Отклонения» п. 3); прямой адрес очереди багов сотрудником ведёт на «Мои заявки». Тесты: features/shell/NavMenu.test.tsx, router-тест (по образцу существующих). Вёрстка шапки по `lqJTl`, `W6KTfj`, меню 360 по `brYq4`
- [x] 13.3 TDD: `AgentPage` кладёт ссылку-кнопку «Сообщить о проблеме» (`/bugs/new?agentId=…`) в слот `actions` для всех, рядом с «Архивировать агента» у разработчика. Тесты: pages/AgentPage.test.tsx. Вёрстка по фреймам `j6jg1B`, `n9o2T`

## 14. Интеграционная проверка и документация
> track: integration
> depends: 6, 7, 8, 11, 12, 13

- [x] 14.1 Контракт фронт-бэк: Zod-схемы портала разбирают реальные ответы `bugs.responses.ts` и формат комментария бага (тест или скрипт по образцу проверки Э2); расхождений нет
- [x] 14.2 Миграция 037 на локальной БД (PostgreSQL 5432, см. `backend/.env`): применяется и откатывается по комментарию в шапке; если БД недоступна — зафиксировать в итоге
- [x] 14.3 Сквозной сценарий в браузере (Playwright MCP): сотрудник из карточки агента сообщает о проблеме → разработчик видит баг в «Багах» и уведомление → берёт в работу → закрывает «Не будет исправлен» с причиной → автор видит статус и причину, пишет комментарий → разработчик переоткрывает. Один скриншот экрана бага
- [x] 14.4 Документация: раздел о багах в `backend/CLAUDE.md`/README модуля портала (эндпоинты, статусы), обновить «Текущее состояние кода» в `FEATURER_ROADMAP.md`

## 15. Code review
> track: review
> depends: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14

- [x] 15.1 Code review всех изменений change от base commit по измерениям: соответствие specs/design, стандарты проекта, корректность (выполняет фаза Review workflow `apply-openspec-change`)
- [x] 15.2 Исправить blocking и major (дефекты поведения — через тест, воспроизводящий ошибку), не больше 2 раундов ревью; оставшиеся minor перечислить в итоге; регрессия зелёная
