# Architecture: add-featurer-request-comments

## Scope

Бэкенд-модуль `backend/src/modules/portal`: агрегат комментария, политика доступа к заявке, три эндпоинта ленты, событие о новом комментарии. Модуль `notifications`: правило и подписчик `request.comment-added`, список активных разработчиков. Модуль `telegram`: ссылка на заявку в сообщении. Конфигурация: `PORTAL_PUBLIC_URL`. Портал `portal/src`: новая фича `comments`, слот в `RequestDetails`, `RequestPage`.

---

## Backend — Domain Model

### Entities
| Name | Status (new/existing) | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `RequestComment` (`portal/domain/request-comment.ts`) | new | да | `id`, `requestId`, `authorId`, `body: CommentBody`, `createdAt`, `editedAt \| null` | Комментарий к заявке: создание, правка автором в окне 15 минут |
| `IdeaRequest` (`portal/domain/idea-request.ts`) | existing, без изменений | да | `authorId`, `title` | Источник `authorId` для проверки доступа и `title` для события |

### Aggregates
| Aggregate | Root entity | Входит в состав (entities/VO) | Инварианты, которые защищает |
|---|---|---|---|
| RequestComment | `RequestComment` | `CommentBody` | Текст всегда валиден (`CommentBody`). Править может только автор комментария. Правка возможна только пока `now - createdAt ≤ 15 мин`. `createdAt` не меняется, `editedAt ≥ createdAt`. Принадлежность заявке (`requestId`) не меняется |

### Value Objects
| Name | Поля | Почему VO (immutable/self-validating) |
|---|---|---|
| `CommentBody` (`portal/domain/comment-body.ts`, new) | `value: string` (trim по краям, непустое, `≤ MAX_COMMENT_LENGTH = 4000`) | Самопроверка при создании, 400 через `ArgumentInvalidError`; одно правило для добавления и правки |
| `CommentAuthorRole` (`portal/domain/ports/comment-query.port.ts`, new тип) | `'request_author' \| 'developer'` | Роль автора комментария в заявке для ответа API |
| `RequestAccessPolicy` (`portal/domain/request-access-policy.ts`, new, чистая функция) | `canView(request: { authorId }, actor: { id, roles })` | Единое правило «автор или `developer`» для заявки и ленты |

### Services
| Service | Слой (application/domain/infrastructure) | Ответственность |
|---|---|---|
| `ListCommentsUseCase` (new, `portal/application/list-comments.use-case.ts`) | application | Заявка → политика доступа → `CommentQuery.listByRequest` → признак `canEdit` по часам |
| `PostCommentUseCase` (new, `portal/application/post-comment.use-case.ts`) | application | В транзакции: заявка → политика → `CommentBody.of` → `RequestComment.create` → `insert` → `RequestCommentPostedEvent`; после коммита — `findView` |
| `EditCommentUseCase` (new, `portal/application/edit-comment.use-case.ts`) | application | Заявка → политика → `findById` комментария (другая заявка → 404) → `comment.edit` → `update` → `findView` |
| `GetRequestUseCase` (existing, меняется) | application | Переходит на `RequestAccessPolicy`, поведение прежнее |
| `CommentRepository` / `SlonikCommentRepository` (new, `portal/domain/ports/comment-repository.port.ts`, `portal/infrastructure/slonik-comment.repository.ts`) | domain port / infrastructure | `insert`, `findById`, `update` (тело и `edited_at`) |
| `CommentQuery` / `SlonikCommentQuery` (new, `portal/domain/ports/comment-query.port.ts`, `portal/infrastructure/slonik-comment.query.ts`) | domain port / infrastructure | Read-модель: JOIN автора (ФИО по правилам `employee-directory`) и заявки (`authorRole`), `ORDER BY created_at, id` |
| `CommentsController` (new, `portal/interface/http/comments.controller.ts`) + `comments.schemas.ts`, `comments.responses.ts` | interface | `GET`/`POST /portal/requests/:id/comments`, `PATCH /portal/requests/:id/comments/:commentId` |
| `RequestCommentPostedEvent` + `commentExcerpt` (new, `portal/contracts/request-comment-posted.event.ts`) | contracts | Событие `portal.request_comment_posted`, фрагмент текста до 200 символов; регистрация в `register-portal-events.ts` |
| `RequestCommentRule` (new, `notifications/domain/request-comment.rule.ts`) | domain (notifications) | Выбор получателей и черновики `request.comment-added` |
| `RequestCommentPostedSubscriber` (new, `notifications/application/request-comment-posted.subscriber.ts`) | application (notifications) | Имя автора комментария, список разработчиков (только если пишет автор заявки), создание уведомлений |
| `UserDirectoryPort` / `UserDirectory` (existing, меняется, `notifications/domain/ports/user-directory.port.ts`, `notifications/infrastructure/user-directory.ts`) | port / infrastructure | + `listActiveDeveloperIds()` |
| `notificationMessage` / `portalRequestUrl` (existing / new, `telegram/infrastructure/telegram/messenger.channel.ts`, `telegram/domain/portal-request-url.ts`) | infrastructure / domain (telegram) | Строка «Открыть заявку» для цели `request` при заданном адресе портала |
| `TelegramSettingsPort` + адаптер (existing, меняется) | port / infrastructure | + `portalUrl: string \| null` из `PORTAL_PUBLIC_URL` |

### Method Signatures (ключевые, по каждому сервису)
| Service.Method | Params | Returns | Краткое описание |
|---|---|---|---|
| `CommentBody.of` | `raw: string` | `CommentBody` | Trim, непустое, `≤ 4000`; иначе `ArgumentInvalidError` |
| `RequestComment.create` | `{ id, requestId, authorId, body: CommentBody, now: Date }` | `RequestComment` | Новый комментарий, `editedAt = null` |
| `RequestComment.restore` | `{ id, requestId, authorId, body, createdAt, editedAt }` | `RequestComment` | Из БД |
| `RequestComment.canEdit` | `by: string, now: Date` | `boolean` | `by === authorId && now - createdAt ≤ COMMENT_EDIT_WINDOW_MS` |
| `RequestComment.edit` | `by: string, body: CommentBody, now: Date` | `void` | Чужой → `CommentNotOwnedError`; окно истекло → `CommentEditWindowExpiredError` |
| `RequestAccessPolicy.canView` | `request: { authorId: string }, actor: { id: string; roles: readonly string[] }` | `boolean` | Автор или `developer` |
| `ListCommentsUseCase.execute` | `{ requestId, actorId, roles }` | `CommentView[]` | 404 при отсутствии заявки или доступа |
| `PostCommentUseCase.execute` | `{ requestId, actorId, roles, body: string }` | `CommentView` | 400 / 404 |
| `EditCommentUseCase.execute` | `{ requestId, commentId, actorId, roles, body: string }` | `CommentView` | 400 / 403 / 404 / 409 |
| `CommentRepository.insert` | `comment: RequestComment` | `void` | Вставка |
| `CommentRepository.findById` | `id: string` | `RequestComment \| null` | Некорректный UUID → `null` |
| `CommentRepository.update` | `comment: RequestComment` | `void` | `body`, `edited_at` |
| `CommentQuery.listByRequest` | `requestId: string` | `CommentRecord[]` | `{ id, body, author: {id, login, fullName}, authorRole, createdAt, editedAt }`, старые первыми |
| `CommentQuery.findView` | `id: string` | `CommentRecord \| null` | Одна запись в том же формате |
| `commentExcerpt` | `body: string` | `string` | `≤ 200` символов, при обрезке последний — `…` |
| `RequestCommentRule.recipients` | `event: RequestCommentPostedEvent, developerIds: readonly string[]` | `string[]` | Пишет автор → разработчики без автора; иначе → `[requestAuthorId]` |
| `RequestCommentRule.apply` | `event, commenterName: string, developerIds: readonly string[]` | `NotificationDraft[]` | Заголовок, текст, цель `request`, `actorId = commenterId` |
| `UserDirectoryPort.listActiveDeveloperIds` | — | `Promise<string[]>` | `is_active` и роль `developer` |
| `portalRequestUrl` | `base: string, requestId: string` | `string` | `{base}/requests/{encodeURIComponent(id)}` |
| `notificationMessage` | `notification: Notification, portalUrl: string \| null` | `string` | + строка-ссылка для цели `request` |

`CommentView` = `CommentRecord` + `canEdit: boolean` (`portal/application/comment-view.ts`). Новые ошибки в `portal/domain/errors.ts`, маппинг в `portal-error-status.ts`: `CommentNotFoundError` (`PORTAL_COMMENT_NOT_FOUND` → 404), `CommentNotOwnedError` (`PORTAL_COMMENT_NOT_OWNED` → 403), `CommentEditWindowExpiredError` (`PORTAL_COMMENT_EDIT_EXPIRED` → 409). Константы `MAX_COMMENT_LENGTH`, `COMMENT_EDIT_WINDOW_MS`, `COMMENT_EXCERPT_LENGTH` — рядом с VO и событием. `notifications/domain/notification-type.ts`: + `request.comment-added`. Миграция: `backend/db/migrations/036_portal_request_comments.sql`. Конфигурация: `PORTAL_PUBLIC_URL` в `shared/config/env.schema.ts` и `backend/.env.example`. Регистрация в `portal.module.ts` (контроллер, use-case'ы, адаптеры) и `notifications.module.ts` (подписчик в `notification-event-subscriptions.ts`).

---

## Frontend — UI Model

### Pages
| Page | Route | Структура (ui / +model / +mediator) | Назначение |
|---|---|---|---|
| `RequestPage` (existing, `pages/RequestPage.tsx`) | `/requests/:id` | ui + `use-request.ts` | Передаёт `<CommentsSection requestId={id} />` в слот `comments` у `RequestDetails` для автора и разработчика, в любом статусе |

### Features (переиспользуемые модули с бизнес-логикой)
| Feature | Статус (new/existing) | Публичный API (index.ts) | model/ (хуки, api.ts) | Назначение |
|---|---|---|---|---|
| `comments` | new | `CommentsSection` | `comments.api.ts` (`listComments`, `postComment`, `editComment`), `comments.schema.ts` (`commentSchema`, `commentListSchema`), `comments.queries.ts` (`commentsQuery`), `use-post-comment.ts`, `use-edit-comment.ts`, `comments.errors.ts` (`commentErrorMessage`) | Лента, отправка и правка комментариев |
| `requests` | existing, меняется | без изменений состава | — | `RequestDetails` получает слот `comments` |

### UI-компоненты (page-local и shared)
| Component | Расположение (features/<f>/ui · components/ui · pages) | Props (основные) | Назначение |
|---|---|---|---|
| `CommentsSection` (new) | `features/comments/ui/CommentsSection.tsx` | `requestId: string` | Заголовок «Комментарии», состояния загрузки, ошибки и пустой ленты, `CommentList` + `CommentComposer` |
| `CommentList` (new, внутренний) | `features/comments/ui/CommentList.tsx` | `comments: Comment[]`, `requestId` | Список `CommentItem` от старых к новым |
| `CommentItem` (new, внутренний) | `features/comments/ui/CommentItem.tsx` | `comment: Comment`, `requestId` | Аватар, имя, отметка роли, время, «изменено», текст (`whitespace-pre-wrap`); «Изменить» по `canEdit` и правка на месте |
| `CommentComposer` (new, внутренний) | `features/comments/ui/CommentComposer.tsx` | `requestId` | `Textarea`, счётчик при приближении к пределу, «Отправить»; локальное состояние текста |
| `RequestDetails` (existing, меняется) | `features/requests/ui/RequestDetails.tsx` | + `comments?: ReactNode` | Рендерит слот под основной карточкой заявки |
| `PersonAvatar`, `Textarea`, `Button`, `Badge`, `Alert` (existing) | `components/ui` | — | Переиспользуются |

Общие модули в `lib/`: `format.ts` — `formatDateTime(iso)` (дата и время комментария), если готового нет; `query-keys.ts` — `COMMENTS_KEY`.

### Hooks (model)
| Hook | Расположение | Тип (state-хук / query options factory) | Возвращает |
|---|---|---|---|
| `commentsQuery(requestId)` | `features/comments/model/comments.queries.ts` | query options factory | `queryOptions` с ключом `[...COMMENTS_KEY, requestId]`, `refetchInterval: 30_000`, `refetchOnWindowFocus: true`, `refetchIntervalInBackground: false` |
| `usePostComment(requestId)` | `features/comments/model/use-post-comment.ts` | мутация | При успехе добавляет комментарий в кеш ленты и инвалидирует её |
| `useEditComment(requestId)` | `features/comments/model/use-edit-comment.ts` | мутация | При успехе заменяет комментарий в кеше; при 409/403 инвалидирует ленту |

### Паттерны, которые нужно учесть при проектировании
- [x] Публичный API фичи только через `index.ts`: из `features/comments` экспортируется только `CommentsSection`
- [x] Запросы к backend — через query options factory в `model/comments.queries.ts`, мутации — `use-*.ts`
- [x] Ошибки API нормализуются через `ApiError` (`src/lib/errors.ts`), ветвление по `code`: `PORTAL_COMMENT_EDIT_EXPIRED`, `PORTAL_COMMENT_NOT_OWNED`, `PORTAL_COMMENT_NOT_FOUND`, `PORTAL_REQUEST_NOT_FOUND`
- [ ] `mediator/` не нужен: на странице один новый виджет, он не зависит от состояния панели решения
- [x] Именованные слоты: `RequestDetails` получает слот `comments` по образцу существующего `decision`, `children` не используется
- [x] `isInitialLoad` / `isRefreshing`: скелет ленты только при первой загрузке, фоновые обновления (таймер, фокус) не заменяют показанную ленту
- [x] Новых общих компонентов нет: `Textarea`, `PersonAvatar`, `Badge` уже есть в `components/ui/`; цвета — токенами

---

## Diagrams

Как и в `add-featurer-catalog-roadmap` и `add-featurer-ideas-review`, диаграммы описаны текстом, в Miro не переносятся.

### 1. Domain Entity Interaction
`IdeaRequest 1—* RequestComment` (по `requestId`, `ON DELETE CASCADE`). Комментарий ссылается на заявку только идентификатором и не входит в её агрегат. `RequestComment` содержит `CommentBody`. `RequestComment.authorId → auth_users`. `authorRole` не хранится, а выводится в read-модели сравнением `comment.authorId` с `IdeaRequest.authorId`. `RequestAccessPolicy` читает `IdeaRequest.authorId` и роли актора.

### 2. External Modules Interaction
Портал (SPA) → `GET`/`POST /portal/requests/:id/comments`, `PATCH /portal/requests/:id/comments/:commentId` (опрос `GET` раз в 30 с на открытом экране). `portal` → `auth` (guard, роли из access-токена). `portal` → outbox в той же транзакции (`RequestCommentPostedEvent`) → `notifications` асинхронно (`RequestCommentPostedSubscriber` → `UserDirectoryPort.findFullNameById` и, если пишет автор, `listActiveDeveloperIds` → `RequestCommentRule` → `CreateNotificationsUseCase`) → каналы: realtime (control-center и manager-helper открывают заявку по цели `request`, без изменений) и `telegram` (`MessengerChannel` → `notificationMessage` со ссылкой `PORTAL_PUBLIC_URL/requests/:id`). Внешних систем нет, кроме Telegram Bot API.

### 3. Layer Interaction — от Controller до Response
`CommentsController.post` → Zod (`postCommentSchema`: `{ body: string ≤ 20000 }`) → `PostCommentUseCase.execute` → транзакция: `RequestRepository.findById` (нет → `RequestNotFoundError`) → `RequestAccessPolicy.canView` (нет → `RequestNotFoundError`) → `CommentBody.of` (`ArgumentInvalidError`) → `RequestComment.create` → `CommentRepository.insert` → `DomainEventPublisherPort.publish(RequestCommentPostedEvent { excerpt: commentExcerpt(body) })` → commit → `CommentQuery.findView` → `canEdit` → 201 `CommentResponse`.

`CommentsController.edit` → Zod → `EditCommentUseCase.execute` → заявка и политика (404) → `CommentRepository.findById` (нет или другая заявка → `CommentNotFoundError` 404) → `CommentBody.of` (400) → `comment.edit(actorId, body, now)` (`CommentNotOwnedError` 403, `CommentEditWindowExpiredError` 409) → `CommentRepository.update` → `findView` → 200.

`CommentsController.list` → `ListCommentsUseCase` → заявка и политика (404) → `CommentQuery.listByRequest` → `canEdit` для каждой записи → 200 `{ items }`.

Ошибки маппятся через `registerPortalErrorStatuses`, 400 — из `ArgumentInvalidError`.

---

## Confirmation Checklist
- [x] Названия entity/aggregate/VO согласованы
- [x] Названия и сигнатуры ключевых методов сервисов согласованы
- [x] Слои (pages/features/components), структура model/ui и паттерны фронта согласованы
- [x] Диаграммы взаимодействия: текстовое описание, как в прошлых change
- [x] Пользователь подтвердил переход к tasks.md
