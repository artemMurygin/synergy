<!--
  Правила выполнения:
  - Бэкенд: `cd backend`, тесты `npx vitest run <путь>`, типы `npm run typecheck`, линт `npm run lint`.
    Интеграционные тесты БД идут только при заданной `PROGRAMS_ETL_TEST_ADMIN_URL` (иначе пропускаются):
    перед группами 1 и 4 убедиться, что переменная задана (admin URL — из POSTGRES_URL в backend/.env с базой /postgres).
  - Портал: `cd portal`, тесты `npx vitest run <путь>`, типы `npm run typecheck`.
  - Последняя миграция — 035; новая — `036_portal_request_comments.sql` (сверить `ls backend/db/migrations`).
  - Макеты — `design/synergy-design.pen`, фрейм Portal (`t2DLO`), раздел `18 · Заявка · комментарии` (`QGOpi`). Node ID — в `frames`
    групп вёрстки и в `ui-design.md`. Фрейм читать через `mcp__pencil__*` (`execute`/`Get`), `.pen` иначе не читать и не править.
  - Модуль бэкенда — `backend/src/modules/portal` (в группах 1–6 пути относительно него, если не указано иное).
  - Коды ошибок: `PORTAL_COMMENT_NOT_FOUND` (404), `PORTAL_COMMENT_NOT_OWNED` (403), `PORTAL_COMMENT_EDIT_EXPIRED` (409);
    нет доступа к заявке — существующий `PORTAL_REQUEST_NOT_FOUND` (404).
  - Константы: `MAX_COMMENT_LENGTH = 4000`, `COMMENT_EDIT_WINDOW_MS = 15 * 60 * 1000`, `COMMENT_EXCERPT_LENGTH = 200`.
-->

## 1. backend, БД: миграция `036_portal_request_comments`
> track: backend
> depends: —
> specs: featurer-request-comments → «Лента комментариев заявки»; featurer-request-comments → «Добавление комментария»
> arch: Entities/RequestComment
> files: backend/db/migrations/036_portal_request_comments.sql; backend/src/database/postgres/portal-request-comments-migration.spec.ts
> frames: —

- [x] 1.1 TDD: миграция создаёт `portal_request_comments` (`id UUID PK`, `request_id UUID NOT NULL REFERENCES portal_requests(id) ON DELETE CASCADE`, `author_id UUID NOT NULL REFERENCES auth_users(id)`, `body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000)`, `created_at TIMESTAMPTZ NOT NULL`, `edited_at TIMESTAMPTZ NULL CHECK (edited_at IS NULL OR edited_at >= created_at)`) и индекс `portal_request_comments_request_idx (request_id, created_at, id)`. Тест проверяет: вставка валидной строки; отказ на пустом и 4001-символьном `body`, на `edited_at < created_at`, на несуществующей заявке; каскадное удаление с заявкой. Тесты: backend/src/database/postgres/portal-request-comments-migration.spec.ts (по образцу `portal-request-review-migration.spec.ts`). Реализация: backend/db/migrations/036_portal_request_comments.sql (откат комментарием: `DROP TABLE portal_request_comments`). Готово, когда тест green при заданной `PROGRAMS_ETL_TEST_ADMIN_URL`

## 2. backend, домен: `RequestComment`, `CommentBody`, политика доступа
> track: backend
> depends: —
> specs: featurer-request-comments → «Добавление комментария»; featurer-request-comments → «Правка своего комментария»; featurer-request-comments → «Доступ к ленте комментариев»
> arch: Entities/RequestComment; Aggregates/RequestComment; Value Objects/CommentBody; Value Objects/RequestAccessPolicy
> files: domain/comment-body.ts; domain/comment-body.spec.ts; domain/request-comment.ts; domain/request-comment.spec.ts; domain/request-access-policy.ts; domain/request-access-policy.spec.ts; domain/errors.ts; domain/errors.spec.ts; interface/portal-error-status.ts
> frames: —

- [x] 2.1 TDD: `CommentBody.of(raw)` обрезает пробелы и переводы строк по краям, сохраняет переносы внутри, отвергает пустую строку (в том числе из одних пробелов и переносов) и строку длиннее 4000 после обрезки через `ArgumentInvalidError`; ровно 4000 символов допустимо; `<b>` сохраняется как есть. Тесты: domain/comment-body.spec.ts. Реализация: domain/comment-body.ts (`MAX_COMMENT_LENGTH`)
- [x] 2.2 TDD: `RequestComment.create({ id, requestId, authorId, body, now })` (`editedAt = null`) и `restore(...)`; `canEdit(by, now)` — `by === authorId && now - createdAt ≤ COMMENT_EDIT_WINDOW_MS`; `edit(by, body, now)`: чужой → `CommentNotOwnedError`, через 15 мин + 1 мс → `CommentEditWindowExpiredError`, иначе меняет `body` и `editedAt`, `createdAt` прежний; окно не продлевается правкой (правка на 10-й минуте, затем на 16-й → ошибка). Тесты: domain/request-comment.spec.ts. Реализация: domain/request-comment.ts; ошибки и коды в domain/errors.ts (`CommentNotFoundError` `PORTAL_COMMENT_NOT_FOUND`, `CommentNotOwnedError` `PORTAL_COMMENT_NOT_OWNED`, `CommentEditWindowExpiredError` `PORTAL_COMMENT_EDIT_EXPIRED`)
- [x] 2.3 TDD: `RequestAccessPolicy.canView({ authorId }, { id, roles })` — `true` для автора и для `developer`, `false` для остальных; коды новых ошибок зарегистрированы в `portal-error-status.ts` (404 / 403 / 409). Тесты: domain/request-access-policy.spec.ts, domain/errors.spec.ts. Реализация: domain/request-access-policy.ts, interface/portal-error-status.ts

## 3. backend, контракт события о комментарии
> track: backend
> depends: —
> specs: featurer-request-comments → «Событие о новом комментарии в outbox»
> arch: Services/RequestCommentPostedEvent + commentExcerpt
> files: contracts/request-comment-posted.event.ts; contracts/register-portal-events.ts; contracts/portal-events.spec.ts
> frames: —

- [x] 3.1 TDD: `RequestCommentPostedEvent` (`portal.request_comment_posted`, `aggregateId` = id комментария, payload `{ requestId, requestAuthorId, commenterId, requestTitle, excerpt }`) регистрируется и разбирается из outbox; `commentExcerpt(body)` возвращает текст без изменений, если он не длиннее 200, иначе первые 199 символов + `…` (итог ровно 200). Тесты: contracts/portal-events.spec.ts. Реализация: contracts/request-comment-posted.event.ts (`COMMENT_EXCERPT_LENGTH`), contracts/register-portal-events.ts

## 4. backend, инфраструктура: репозиторий и read-модель комментариев
> track: backend
> depends: 1, 2
> specs: featurer-request-comments → «Лента комментариев заявки»; featurer-request-comments → «Правка своего комментария»
> arch: Services/CommentRepository / SlonikCommentRepository; Services/CommentQuery / SlonikCommentQuery; Value Objects/CommentAuthorRole
> files: domain/ports/comment-repository.port.ts; domain/ports/comment-query.port.ts; infrastructure/slonik-comment.repository.ts; infrastructure/slonik-comment.query.ts; infrastructure/postgres-portal.repositories.spec.ts; application/test-doubles.ts
> frames: —

- [x] 4.1 TDD: `CommentRepository.insert`, `findById` (некорректный UUID и неизвестный id → `null`, восстанавливает `editedAt`), `update` (пишет `body` и `edited_at`). Тесты: infrastructure/postgres-portal.repositories.spec.ts. Реализация: domain/ports/comment-repository.port.ts, infrastructure/slonik-comment.repository.ts; in-memory двойник `InMemoryCommentRepository` в application/test-doubles.ts
- [x] 4.2 TDD: `CommentQuery.listByRequest(requestId)` — комментарии заявки `ORDER BY created_at, id` (стабильно при равном времени), с `author: { id, login, fullName }` (ФИО по правилам `employee-directory`, без ФИО — логин, как в `slonik-request.query.ts`) и `authorRole`: `request_author`, если `author_id` совпадает с автором заявки, иначе `developer`; чужие заявки не попадают; пустая лента → `[]`; `findView(id)` — одна запись в том же формате или `null`. Тесты: infrastructure/postgres-portal.repositories.spec.ts. Реализация: domain/ports/comment-query.port.ts (`CommentRecord`, `CommentAuthorRole`), infrastructure/slonik-comment.query.ts; in-memory двойник в application/test-doubles.ts

## 5. backend, application: лента, добавление, правка
> track: backend
> depends: 2, 3, 4
> specs: featurer-request-comments → «Доступ к ленте комментариев»; featurer-request-comments → «Лента комментариев заявки»; featurer-request-comments → «Добавление комментария»; featurer-request-comments → «Правка своего комментария»; featurer-request-comments → «Событие о новом комментарии в outbox»
> arch: Services/ListCommentsUseCase; Services/PostCommentUseCase; Services/EditCommentUseCase; Services/GetRequestUseCase
> files: application/comment-view.ts; application/list-comments.use-case.ts; application/post-comment.use-case.ts; application/edit-comment.use-case.ts; application/comments.use-cases.spec.ts; application/get-request.use-case.ts; application/request-read.use-cases.spec.ts; portal.module.ts
> frames: —

- [x] 5.1 TDD: `ListCommentsUseCase.execute({ requestId, actorId, roles })` — заявки нет или `RequestAccessPolicy` запрещает → `RequestNotFoundError`; иначе записи `CommentQuery.listByRequest` с `canEdit` по `RequestComment.canEdit(actorId, clock.now())` (свой на 5-й минуте → `true`, на 20-й → `false`, чужой → `false`). `GetRequestUseCase` переходит на `RequestAccessPolicy`, существующие тесты в request-read.use-cases.spec.ts остаются green. Тесты: application/comments.use-cases.spec.ts. Реализация: application/comment-view.ts, application/list-comments.use-case.ts, application/get-request.use-case.ts
- [x] 5.2 TDD: `PostCommentUseCase.execute({ requestId, actorId, roles, body })` в одной транзакции: заявка + политика (404) → `CommentBody.of` (400) → `RequestComment.create` (время из `Clock`) → `insert` → `publish(RequestCommentPostedEvent)` с `excerpt = commentExcerpt(body)`, `requestTitle`, `requestAuthorId`; после коммита возвращает `CommentView` (`canEdit: true`). Комментарий создаётся в любом статусе заявки (`new`, `under_review`, `accepted`, `rejected`), статус заявки не меняется; при ошибке публикации комментарий не сохраняется (двойник транзакции откатывает). Тесты: application/comments.use-cases.spec.ts. Реализация: application/post-comment.use-case.ts
- [x] 5.3 TDD: `EditCommentUseCase.execute({ requestId, commentId, actorId, roles, body })`: заявка + политика (404) → `findById` (нет или другой `requestId` → `CommentNotFoundError`) → `CommentBody.of` (400) → `comment.edit` (403 / 409) → `update` → `CommentView`; событий не публикует. Use-case'ы, порты и адаптеры зарегистрированы в `portal.module.ts`. Тесты: application/comments.use-cases.spec.ts. Реализация: application/edit-comment.use-case.ts, portal.module.ts

## 6. backend, HTTP: эндпоинты ленты
> track: backend
> depends: 5
> specs: featurer-request-comments → «Доступ к ленте комментариев»; featurer-request-comments → «Лента комментариев заявки»; featurer-request-comments → «Добавление комментария»; featurer-request-comments → «Правка своего комментария»
> arch: Services/CommentsController + comments.schemas.ts, comments.responses.ts
> files: interface/http/comments.controller.ts; interface/http/comments.controller.spec.ts; interface/http/comments.schemas.ts; interface/http/comments.responses.ts; interface/http/portal-contract.spec.ts; portal.module.ts; portal-flow.e2e.spec.ts
> frames: —

- [x] 6.1 TDD: `GET /portal/requests/:id/comments` → 200 `{ items: CommentResponse[] }`; `POST /portal/requests/:id/comments` `{ body }` → 201 `CommentResponse`; `PATCH /portal/requests/:id/comments/:commentId` `{ body }` → 200. `CommentResponse = { id, body, author: { id, login, fullName }, authorRole: 'request_author' | 'developer', createdAt, editedAt: string | null, canEdit }` (даты ISO). Без `@Roles`, пользователь и роли — из access-токена. Zod тела `{ body: z.string().max(20000) }`. Статусы: 400 (пустой/длинный текст, нет `body`), 401 без токена, 403 чужой комментарий, 404 (нет доступа, неизвестная заявка, неверный UUID, комментарий другой заявки), 409 окно истекло. Тесты: interface/http/comments.controller.spec.ts (по образцу requests.controller.spec.ts и `testing/http-fixture.ts`), interface/http/portal-contract.spec.ts (форма ответа). Реализация: interface/http/comments.controller.ts, comments.schemas.ts, comments.responses.ts, регистрация в portal.module.ts
- [x] 6.2 TDD: сквозной сценарий в portal-flow.e2e.spec.ts: автор пишет комментарий → разработчик видит его в ленте и отвечает → лента автора из двух записей с правильными `authorRole`; посторонний сотрудник получает 404; правка своего комментария → `editedAt` заполнен; в outbox по событию на каждый добавленный комментарий, на правку — нет. Тесты: portal-flow.e2e.spec.ts. Готово, когда тест green (с БД) или корректно пропущен без `PROGRAMS_ETL_TEST_ADMIN_URL`

## 7. backend, notifications: `request.comment-added`
> track: backend
> depends: 3
> specs: notifications → «Уведомление о новом комментарии к заявке»; notifications → «Доставка уведомлений о комментариях по каналам»
> arch: Services/RequestCommentRule; Services/RequestCommentPostedSubscriber; Services/UserDirectoryPort / UserDirectory
> files: backend/src/modules/notifications/domain/notification-type.ts; backend/src/modules/notifications/domain/notification-type.spec.ts; backend/src/modules/notifications/domain/request-comment.rule.ts; backend/src/modules/notifications/domain/request-comment.rule.spec.ts; backend/src/modules/notifications/domain/ports/user-directory.port.ts; backend/src/modules/notifications/infrastructure/user-directory.ts; backend/src/modules/notifications/application/request-comment-posted.subscriber.ts; backend/src/modules/notifications/application/request-comment-posted.subscriber.spec.ts; backend/src/modules/notifications/application/notification-event-subscriptions.ts; backend/src/modules/notifications/application/test-doubles.ts
> frames: —

- [x] 7.1 TDD: тип `request.comment-added` в `NOTIFICATION_TYPES`; `RequestCommentRule.recipients(event, developerIds)`: пишет автор заявки → `developerIds` без `commenterId`; иначе → `[requestAuthorId]`; `apply(event, commenterName, developerIds)` → черновики с заголовком «Новый комментарий к заявке: {requestTitle}», текстом «{commenterName}: {excerpt}», целью `request:{requestId}`, `actorId = commenterId`; единственный разработчик пишет в свою заявку → `[]`. Тесты: domain/request-comment.rule.spec.ts, domain/notification-type.spec.ts. Реализация: domain/request-comment.rule.ts, domain/notification-type.ts
- [x] 7.2 TDD: `UserDirectoryPort.listActiveDeveloperIds()` — id пользователей с ролью `developer` и `is_active = true` (деактивированный не попадает); адаптер `UserDirectory`; двойник в application/test-doubles.ts. Тесты: тест адаптера с БД рядом с существующими тестами `user-directory` (или в notification.repository.spec.ts, если отдельного нет; пропускается без `PROGRAMS_ETL_TEST_ADMIN_URL`). Реализация: domain/ports/user-directory.port.ts, infrastructure/user-directory.ts
- [x] 7.3 TDD: `RequestCommentPostedSubscriber.handle`: не тот класс события → `UnexpectedSourceEventError`; имя через `findFullNameById(commenterId)` (`null` → `NotificationActorNotFoundError`); `listActiveDeveloperIds` вызывается только если пишет автор заявки; пустой список получателей — успешная обработка без вызова `CreateNotificationsUseCase`; повторная обработка не создаёт дублей (ключ `source_event_id`). Подписчик зарегистрирован в notification-event-subscriptions.ts. Тесты: application/request-comment-posted.subscriber.spec.ts (по образцу request-taken.subscriber.spec.ts). Реализация: application/request-comment-posted.subscriber.ts, application/notification-event-subscriptions.ts

## 8. backend, Telegram: ссылка на заявку и `PORTAL_PUBLIC_URL`
> track: backend
> depends: —
> specs: telegram-notifications → «Ссылка на заявку в сообщении»
> arch: Services/notificationMessage / portalRequestUrl; Services/TelegramSettingsPort + адаптер
> files: backend/src/shared/config/env.schema.ts; backend/.env.example; backend/src/modules/telegram/application/ports/telegram-settings.port.ts; backend/src/modules/telegram/infrastructure/config/telegram-settings.ts; backend/src/modules/telegram/domain/portal-request-url.ts; backend/src/modules/telegram/domain/portal-request-url.spec.ts; backend/src/modules/telegram/infrastructure/telegram/messenger.channel.ts; backend/src/modules/telegram/infrastructure/telegram/messenger.channel.spec.ts
> frames: —

- [x] 8.1 TDD: `PORTAL_PUBLIC_URL` — необязательный URL (`http`/`https`) в env.schema.ts, описан в `.env.example`; `TelegramSettingsPort.portalUrl: string | null` (без хвостовых `/`, `null` без переменной); `portalRequestUrl(base, id)` → `{base}/requests/{encodeURIComponent(id)}`. Тесты: domain/portal-request-url.spec.ts и тест настроек (рядом с существующими тестами telegram-settings, если есть). Реализация: env.schema.ts, .env.example, telegram-settings.port.ts, infrastructure/config/telegram-settings.ts, domain/portal-request-url.ts
- [x] 8.2 TDD: `notificationMessage(notification, portalUrl)` для цели `request` при заданном адресе добавляет строку `\n<a href="{url}">Открыть заявку</a>` (атрибут экранируется `escapeHtml`); без адреса и для целей `task`/`chat` сообщение байт в байт прежнее; `MessengerChannel` передаёт `settings.portalUrl`. Тесты: infrastructure/telegram/messenger.channel.spec.ts. Реализация: infrastructure/telegram/messenger.channel.ts

## 9. portal, модель фичи `comments`
> track: portal
> depends: 6
> specs: featurer-portal-ui → «Комментарии на экране заявки»
> arch: Features/comments; Hooks/commentsQuery(requestId); Hooks/usePostComment(requestId); Hooks/useEditComment(requestId)
> files: portal/src/features/comments/model/comments.schema.ts; portal/src/features/comments/model/comments.api.ts; portal/src/features/comments/model/comments.queries.ts; portal/src/features/comments/model/use-post-comment.ts; portal/src/features/comments/model/use-edit-comment.ts; portal/src/features/comments/model/comments.errors.ts; portal/src/features/comments/model/comments.fixtures.ts; portal/src/features/comments/model/comments.test.tsx; portal/src/lib/query-keys.ts; portal/src/lib/format.ts
> frames: —

- [x] 9.1 TDD: Zod `commentSchema` / `commentListSchema` по `CommentResponse` (`authorRole` — enum, `editedAt` nullable); `comments.api.ts`: `listComments(requestId)`, `postComment(requestId, body)`, `editComment(requestId, commentId, body)` через `api-client`; `commentsQuery(requestId)` — `queryOptions` с ключом `[...COMMENTS_KEY, requestId]`, `refetchInterval: 30_000`, `refetchOnWindowFocus: true`, `refetchIntervalInBackground: false`; `formatDateTime(iso)` → «14 ноября, 15:42» в lib/format.ts. Тесты: features/comments/model/comments.test.tsx. Реализация: comments.schema.ts, comments.api.ts, comments.queries.ts, comments.fixtures.ts, lib/query-keys.ts, lib/format.ts
- [x] 9.2 TDD: `usePostComment(requestId)` при успехе добавляет комментарий в конец кеша ленты и инвалидирует её; `useEditComment(requestId)` при успехе заменяет комментарий в кеше, при 409/403 инвалидирует ленту; `commentErrorMessage(error)` по `code`: `PORTAL_COMMENT_EDIT_EXPIRED` → «Изменить комментарий уже нельзя: прошло больше 15 минут», `PORTAL_COMMENT_NOT_OWNED`, 400, прочие → общий текст. Тесты: features/comments/model/comments.test.tsx. Реализация: use-post-comment.ts, use-edit-comment.ts, comments.errors.ts

## 10. portal, UI: комментарий и поле ввода
> track: portal
> depends: 9
> specs: featurer-portal-ui → «Комментарии на экране заявки»
> arch: UI-компоненты/CommentItem; UI-компоненты/CommentComposer; UI-компоненты/CommentList
> files: portal/src/features/comments/ui/CommentItem.tsx; portal/src/features/comments/ui/CommentItem.test.tsx; portal/src/features/comments/ui/CommentComposer.tsx; portal/src/features/comments/ui/CommentComposer.test.tsx; portal/src/features/comments/ui/CommentList.tsx
> frames: HCqKi; jol29; TDDeg; WcuPX; IN5ym; qnKAr; WiGWQ; sfji3; a5iY9h; ZxUYp; f3dcS; mD4os

- [x] 10.1 TDD: `CommentItem` — аватар (`PersonAvatar`), имя (длинное обрезается), отметка роли (`Badge`: «Автор заявки» — `surface-sunken`/`ink-80`, «Разработчик» — `info-soft`/`info`), время `formatDateTime`, «· изменено» при `editedAt`, текст текстовым узлом с `whitespace-pre-wrap break-words` (разметка не интерпретируется); «Изменить» только при `canEdit`; правка на месте: поле с текущим текстом, «Сохранить» / «Отмена», «Отмена» возвращает исходный текст; при 409 — предупреждение «Изменить комментарий уже нельзя: прошло больше 15 минут» внутри комментария, исходный текст, «Изменить» скрыто. Тесты: features/comments/ui/CommentItem.test.tsx. Вёрстка по мастеру `HCqKi` и фреймам `TDDeg`, `WcuPX`, `IN5ym`, `qnKAr`, `WiGWQ`, сверка с макетом в этой же задаче
- [x] 10.2 TDD: `CommentComposer` — `Textarea` «Напишите комментарий…», «Отправить» недоступна при пустом (после trim) тексте, больше 4000 символов (красная рамка, «Комментарий длиннее 4000 символов. Сократите текст», счётчик «N / 4000») и во время отправки («Отправляем…», поле недоступно, повторное нажатие не шлёт второй запрос); после успеха поле очищается; при ошибке — `Alert` «Не удалось отправить комментарий», текст остаётся; набранный текст — локальное состояние, не сбрасывается при обновлении ленты; на узком экране кнопка во всю ширину, подсказки «Комментарий увидят…» нет. Тесты: features/comments/ui/CommentComposer.test.tsx. Вёрстка по фреймам `sfji3`, `a5iY9h`, `ZxUYp`, `f3dcS`, `mD4os`, сверка с макетом в этой же задаче
- [x] 10.3 `CommentList` — список `CommentItem` от старых к новым с отступом из макета, без тестов: статичная обёртка без логики (поведение покрыто тестами `CommentItem` и `CommentsSection`). Вёрстка по фрейму `jol29`

## 11. portal: блок «Комментарии» на экране заявки
> track: portal
> depends: 10
> specs: featurer-portal-ui → «Комментарии на экране заявки»
> arch: UI-компоненты/CommentsSection; UI-компоненты/RequestDetails; Pages/RequestPage; Features/comments; Features/requests
> files: portal/src/features/comments/ui/CommentsSection.tsx; portal/src/features/comments/ui/CommentsSection.test.tsx; portal/src/features/comments/index.ts; portal/src/features/requests/ui/RequestDetails.tsx; portal/src/features/requests/ui/RequestDetails.test.tsx; portal/src/pages/RequestPage.tsx; portal/src/pages/RequestPage.test.tsx
> frames: jVVaq; P3Nzo; oyiyS; Ml8i7; j8a7Bl; ZP44z; iyqEW; kqhup; r9M5c

- [x] 11.1 TDD: `CommentsSection({ requestId })` — заголовок «Комментарии» и число комментариев (нет числа в пустой ленте и при загрузке); скелет только при первой загрузке (`isInitialLoad`), фоновое обновление не заменяет ленту индикатором; ошибка загрузки — `Alert` «Не удалось загрузить комментарии» и «Повторить»; пустая лента — подсказка «Комментариев пока нет. Задайте вопрос или уточните детали»; поле ввода видно во всех состояниях; новый комментарий собеседника появляется после refetch без сброса набираемого текста. Публичный API — только `CommentsSection` в features/comments/index.ts. Тесты: features/comments/ui/CommentsSection.test.tsx. Вёрстка по фреймам `Ml8i7`, `iyqEW`, `kqhup`, `r9M5c`, сверка с макетом в этой же задаче
- [x] 11.2 TDD: `RequestDetails` получает слот `comments?: ReactNode` и рендерит его последней карточкой основной колонки (на 1440 — под «Описанием»/«Историей» слева, на 360 — после «Описания процесса», перед подсказкой «Следим за статусом за вас»); `RequestPage` передаёт `<CommentsSection requestId={id} />` автору и разработчику в любом статусе заявки; на 360 нет горизонтальной прокрутки. Тесты: features/requests/ui/RequestDetails.test.tsx, pages/RequestPage.test.tsx. Вёрстка по фреймам `jVVaq`, `P3Nzo`, `oyiyS` (блоки `Ml8i7`, `j8a7Bl`, `ZP44z`), сверка с макетом и один скриншот в браузере в этой же задаче

## 12. Интеграционная проверка и документация
> track: integration
> depends: 6, 7, 8, 11
> specs: featurer-request-comments → «Добавление комментария»; notifications → «Уведомление о новом комментарии к заявке»; telegram-notifications → «Ссылка на заявку в сообщении»; featurer-portal-ui → «Комментарии на экране заявки»
> arch: Services/CommentsController; Services/RequestCommentPostedSubscriber; Pages/RequestPage
> files: backend/src/modules/notifications/portal-notifications.e2e.spec.ts; portal/src/features/comments/model/comments.fixtures.ts; backend/.env.example; FEATURER_ROADMAP.md
> frames: —

- [x] 12.1 Контракт фронт—бэк и уведомления: фикстура портала `comments.fixtures.ts` построена из реального ответа `CommentResponse` бэкенда и разбирается `commentListSchema`; e2e `portal-notifications.e2e.spec.ts` дополнен: комментарий автора → `request.comment-added` у активных разработчиков (не у автора, не у деактивированного), ответ разработчика → уведомление у автора и не у других разработчиков, правка → нет уведомлений. Готово, когда тесты green (с БД) или корректно пропущены без `PROGRAMS_ETL_TEST_ADMIN_URL`
- [x] 12.2 без тестов: документация — `PORTAL_PUBLIC_URL` в `backend/.env.example` с комментарием (тот же origin, что в `AUTH_ALLOWED_ORIGINS`); в `FEATURER_ROADMAP.md` в строке Э4 указан change `add-featurer-request-comments`, в «Текущем состоянии кода» — миграция 036, эндпоинты ленты, тип `request.comment-added`, ссылка в Telegram. Сквозной сценарий в браузере (автор пишет → разработчик видит и отвечает → автор правит свой комментарий в пределах 15 минут) выполнить, если доступны БД и dev-сервер; иначе зафиксировать в итоге, что не выполнен

## 13. Code review
> track: review
> depends: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12

- [ ] 13.1 Code review всех изменений change от base commit по измерениям: соответствие specs/design, стандарты проекта, корректность (выполняет фаза Review workflow `apply-openspec-change`)
- [ ] 13.2 Исправить blocking и major (дефекты поведения — через тест, воспроизводящий ошибку), не больше 2 раундов ревью; оставшиеся minor перечислить в итоге; регрессия зелёная
