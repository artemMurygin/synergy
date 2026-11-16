## Context

Мотивация — в proposal.md (раздел Why), требования — в `specs/`. Ниже только то, что влияет на реализацию.

- Change опирается на Э3 (`add-featurer-ideas-review`): статусы `new | under_review | accepted | rejected`, поле `reviewer`, миграция 035. Э3 в архиве, его спеки синхронизированы с `openspec/specs/`. Дельты этого change только ADDED и существующие требования не переписывают.
- Модуль `backend/src/modules/portal`: агрегат `IdeaRequest`, read-модель `RequestQuery.findView` с ФИО через JOIN `auth_user_profiles`. Правило доступа «автор или `developer`, иначе 404» сейчас живёт прямо в `GetRequestUseCase.execute`.
- Use-case'ы пишут события через `DomainEventPublisherPort.publish` внутри `TransactionRunnerPort.run`, outbox в той же транзакции. События регистрируются в `contracts/register-portal-events.ts`.
- `notifications`: подписчик на событие → правило (`*.rule.ts`, чистый домен) → `CreateNotificationsUseCase.execute(eventId, drafts)`. Дедупликацию даёт `ON CONFLICT (source_event_id, recipient_id, type, target_id) DO NOTHING`. Цель `request` уже есть в `NOTIFICATION_TARGET_TYPES`. `UserDirectoryPort` умеет `findLoginById` и `findFullNameById`.
- Роли — таблица `auth_user_roles (user_id, role)`. Активность — `auth_users.is_active`.
- Telegram: `MessengerChannel.deliver` → `notificationMessage(notification)` (HTML: `<b>title</b>\nbody`, с экранированием). Настройки — `TelegramSettingsPort`. Адреса портала в конфигурации бэкенда нет.
- control-center и manager-helper уже открывают заявку в портале по цели `request` (`CC_PORTAL_URL`, настройка расширения `portalUrl`).
- Портал: `RequestPage` собирает `RequestDetails` (фича `requests`) и действия разработчика (фича `decision`) через проп-слот `decision`. Фичи друг друга не импортируют. Realtime-соединения в портале нет.

## Goals / Non-Goals

**Goals:**
- Комментарий — отдельный агрегат. Его добавление не блокирует заявку и не конфликтует с решениями по ней.
- Одно правило доступа к заявке для экрана заявки и для ленты.
- Правило окна правки живёт только в домене бэкенда. Портал не считает время сам и опирается на признак `canEdit` из ответа.
- Уведомление и ссылка в Telegram переиспользуют существующие механизмы: outbox, правило, каналы.

**Non-Goals:**
- Realtime-обновление ленты (WebSocket) в портале.
- Удаление, вложения, упоминания, реакции, «прочитано» для ленты, счётчик непрочитанных комментариев в списках.
- Центр уведомлений внутри портала.
- Пагинация ленты.
- Перевод существующих правил уведомлений о заявках на ФИО.

## Decisions

### 1. Хранение — таблица `portal_request_comments`, миграция 036

```
portal_request_comments (
  id          UUID PRIMARY KEY,
  request_id  UUID NOT NULL REFERENCES portal_requests(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES auth_users(id),
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at  TIMESTAMPTZ NOT NULL,
  edited_at   TIMESTAMPTZ NULL CHECK (edited_at IS NULL OR edited_at >= created_at)
)
INDEX portal_request_comments_request_idx ON (request_id, created_at, id)
```

Порядок ленты — `ORDER BY created_at, id`: `id` делает порядок стабильным при равном времени. Окно правки в БД не проверяется: это правило домена, зависящее от часов приложения.

- *Почему не JSON-массив в `portal_requests`:* лента растёт без предела, а каждая запись меняла бы строку заявки. Это конфликтовало бы с условными `UPDATE … WHERE decision = expected` из Э3.

### 2. Домен: агрегат `RequestComment` и value object `CommentBody`

- `CommentBody.of(raw)`: `trim` по краям, переносы внутри сохраняются, непустой, `≤ MAX_COMMENT_LENGTH = 4000`, иначе `ArgumentInvalidError` → 400.
- `RequestComment.create({ id, requestId, authorId, body, now })` и `restore(...)` из БД.
- `RequestComment.edit(by, body, now)`: `by !== authorId` → `CommentNotOwnedError` (`PORTAL_COMMENT_NOT_OWNED` → 403); `now - createdAt > COMMENT_EDIT_WINDOW_MS (15 мин)` → `CommentEditWindowExpiredError` (`PORTAL_COMMENT_EDIT_EXPIRED` → 409). Иначе `body := new`, `editedAt := now`.
- `RequestComment.canEdit(by, now)` — тот же предикат для поля `canEdit` в ответе. Одна функция для правки и для признака, чтобы они не разошлись.
- Комментарий хранит только `requestId`, а не ссылку на агрегат `IdeaRequest`: заявка комментарию нужна лишь для проверки доступа и для данных события.

- *Почему 403 для чужого, а не 404:* пользователь, который правит чужой комментарий, уже видит ленту, так что скрывать существование комментария нечего. 404 остаётся для «комментарий не найден в этой заявке».

### 3. Доступ — `RequestAccessPolicy` в домене

`domain/request-access-policy.ts`: `canView({ authorId }, actor: { id, roles })` → `authorId === actor.id || roles.includes('developer')`. `GetRequestUseCase` переходит на неё без изменения поведения. Use-case'ы комментариев сначала читают заявку (`RequestRepository.findById`). Если заявки нет или доступ запрещён, бросают `RequestNotFoundError` → 404. Некорректный UUID в пути отвечает 404, как сейчас для заявки (репозиторий возвращает `null`).

### 4. Use-case'ы и API

| Метод | Use-case | Ответ |
|---|---|---|
| `GET /portal/requests/:id/comments` | `ListCommentsUseCase` | 200 `{ items: CommentResponse[] }` |
| `POST /portal/requests/:id/comments` `{ body }` | `PostCommentUseCase` | 201 `CommentResponse` |
| `PATCH /portal/requests/:id/comments/:commentId` `{ body }` | `EditCommentUseCase` | 200 `CommentResponse` |

```
CommentResponse = {
  id, body,
  author: { id, login, fullName },
  authorRole: 'request_author' | 'developer',
  createdAt, editedAt: string | null,
  canEdit: boolean
}
```

- Ролей нет в `@Roles`: доступ проверяет политика, потому что автор заявки может быть без роли `developer`.
- `authorRole` вычисляется в read-модели: `comment.author_id = request.author_id` → `request_author`, иначе `developer`. Писать могут только автор и разработчики, поэтому третьего значения нет. Если у разработчика позже сняли роль, его старые комментарии остаются с меткой `developer`: это роль в заявке на момент переписки.
- `canEdit` вычисляет use-case по `RequestComment.canEdit(actorId, clock.now())`. Read-модель (`CommentQuery.listByRequest`) возвращает `authorId` и `createdAt`, а use-case дописывает признак.
- `PostCommentUseCase`, в транзакции: `findById` заявки → политика → `CommentBody.of` → `RequestComment.create` → `CommentRepository.insert` → `publish(RequestCommentPostedEvent)`. После коммита — `CommentQuery.findView(commentId)`.
- `EditCommentUseCase`: заявка → политика → `CommentRepository.findById(commentId)`. Комментарий не найден или у него другой `requestId` → `CommentNotFoundError` (`PORTAL_COMMENT_NOT_FOUND` → 404). Затем `comment.edit` → `CommentRepository.update`. Две правки одного автора подряд безопасны и без условного `UPDATE`: последняя запись побеждает, а окно проверяется по неизменному `created_at`.
- Пагинации нет: переписка по заявке — единицы и десятки сообщений. Если лента вырастет, добавится курсор `after`, и формат `{ items }` его выдержит.
- Zod-схема тела: `{ body: z.string() }`. Длину и пустоту проверяет `CommentBody`, чтобы правило жило в одном месте. Верхняя граница сырого тела `z.string().max(20000)` защищает от огромных запросов до trim.

### 5. Событие `RequestCommentPostedEvent`

`contracts/request-comment-posted.event.ts`, тип `portal.request_comment_posted`, `aggregateId` = id комментария. Payload: `{ requestId, requestAuthorId, commenterId, requestTitle, excerpt }`. `excerpt` — тело, обрезанное до 200 символов (`COMMENT_EXCERPT_LENGTH`). При обрезке последний символ заменяется на `…`, так что длина остаётся не больше 200. Обрезка — чистая функция `commentExcerpt(body)` рядом с событием, чтобы правило уведомлений получало готовый текст. Событие регистрируется в `register-portal-events.ts`.

- *Почему в событии нет полного текста:* в уведомлении нужен только фрагмент, а outbox не должен копировать произвольно длинные пользовательские данные.

### 6. Уведомление `request.comment-added`

- `notification-type.ts`: + `request.comment-added`.
- `UserDirectoryPort.listActiveDeveloperIds(): Promise<string[]>` — `SELECT u.id FROM auth_users u JOIN auth_user_roles r ON r.user_id = u.id AND r.role = 'developer' WHERE u.is_active`. Адаптер — существующий `UserDirectory`.
- `RequestCommentRule.recipients(event, developerIds)`: если `commenterId === requestAuthorId`, то `developerIds \ {commenterId}`, иначе `[requestAuthorId]`. `apply(event, commenterName, developerIds)` → черновики: заголовок «Новый комментарий к заявке: {requestTitle}», текст «{commenterName}: {excerpt}», цель `request:{requestId}`, `actorId = commenterId`.
- `RequestCommentPostedSubscriber`: получает имя через `findFullNameById(commenterId)` (`null` → `NotificationActorNotFoundError`, как в `RequestTakenSubscriber`). Разработчиков запрашивает только когда пишет автор. Пустой список получателей — успешная обработка без уведомлений.
- Дедупликация существующая: ключ `(source_event_id, recipient_id, type, target_id)`.

- *Почему разработчики, а не «взявший + писавшие»:* так решил пользователь. Разработчик сейчас один, а правило «все активные разработчики» не требует истории ленты. Если команда вырастет, правило меняется в одном месте (`recipients`), без изменений в API и портале.
- *Почему состав определяется при обработке:* у подписчика outbox нет снимка ролей на момент записи. Задержка обработки — секунды, и уведомлять того, кто уже стал разработчиком, правильнее, чем того, у кого роль сняли.

### 7. Ссылка в Telegram — `PORTAL_PUBLIC_URL`

- `env.schema.ts`: `PORTAL_PUBLIC_URL: z.url({ protocol: /^https?$/ }).optional()`, в `.env.example` с комментарием. В `TelegramSettingsPort` — `portalUrl: string | null` без хвостовых `/`.
- `notificationMessage(notification, portalUrl)`: для `target.type === 'request'` при заданном `portalUrl` добавляется строка `\n<a href="{portalUrl}/requests/{encodeURIComponent(id)}">Открыть заявку</a>`. Атрибут экранируется той же `escapeHtml`. Для других целей и без адреса сообщение байт в байт прежнее.
- Сборка адреса — чистая функция `portalRequestUrl(base, id)` в модуле `telegram`. Переносить её в `shared` ради одного потребителя не стоит.

- *Почему переменная бэкенда, а не настройка в БД:* адрес портала — свойство окружения, как `TELEGRAM_WEBHOOK_URL`. Портал и API живут на одном домене (решение Э1), поэтому значение известно при выкате.
- *Почему для всех `request.*`, а не только для комментариев:* в роадмапе стоит «уведомления в Telegram без глубоких ссылок — закрывается в Э4». Ссылка нужна каждому уведомлению о заявке, а правка — одна функция.

### 8. Портал: фича `comments`, слот в `RequestDetails`

- `features/comments/`: `model/comments.api.ts` (`listComments`, `postComment`, `editComment`), `comments.schema.ts` (Zod `CommentResponse`), `comments.queries.ts` (`commentsQuery(requestId)` — `queryOptions` с `refetchInterval: 30_000`, `refetchOnWindowFocus: true`, `refetchIntervalInBackground: false`), `use-post-comment.ts` и `use-edit-comment.ts` (мутации: при успехе обновляют кеш ленты из ответа и инвалидируют её), `comments.errors.ts` (сообщения по `code`: `PORTAL_COMMENT_EDIT_EXPIRED`, `PORTAL_COMMENT_NOT_OWNED`, 400). `ui/`: `CommentsSection` (корневой, экспортируется), `CommentList`, `CommentItem` (просмотр и правка на месте), `CommentComposer`.
- `RequestDetails` получает необязательный слот `comments?: ReactNode` под основной карточкой заявки. `RequestPage` рендерит `<RequestDetails … comments={<CommentsSection requestId={id} />} />`, и связывает фичи страница.
- Текст выводится как текстовый узел React с `whitespace-pre-wrap` и `break-words`, без `dangerouslySetInnerHTML`.
- Набранный текст живёт в локальном состоянии `CommentComposer` и `CommentItem`. Фоновое обновление запроса его не трогает. Лента показывает `isInitialLoad` (скелет) только при первой загрузке, фоновые обновления индикатора не дают.
- Предел 4000 портал проверяет сам, для доступности кнопки и сообщения. Окно правки не считает: «Изменить» показывается по `canEdit` из последнего ответа. Устаревший `canEdit` даёт 409, после которого лента инвалидируется.
- Двойная отправка: кнопка недоступна при `isPending` мутации.

- *Почему опрос, а не WebSocket:* в портале нет realtime-соединения, а модуль `realtime` бэкенда рассчитан на уведомления пользователя, а не на подписку на объект. Опрос раз в 30 секунд только на открытом экране заявки — дешёвый компромисс. Мгновенное оповещение и так дают уведомления в приложении и в Telegram.

## Risks / Trade-offs

- [Опрос раз в 30 секунд с каждого открытого экрана заявки] → запрос лёгкий (индекс по `request_id`). Опрос останавливается в фоновой вкладке. Пользователей — десятки.
- [Все разработчики получают каждый комментарий автора; при росте команды это шум] → правило изолировано в `RequestCommentRule.recipients`, сужение до «взявший + писавшие» — правка одного метода и спеки.
- [Сообщение в Telegram со ссылкой на недоступный адрес, если `PORTAL_PUBLIC_URL` задан неверно] → валидация URL при старте. Без переменной ссылки просто нет.
- [Признак `canEdit` устаревает, пока экран открыт] → сервер всё равно проверяет окно, портал показывает понятное сообщение по 409 и обновляет ленту.
- [Часы приложения и время `created_at` из разных источников] → `created_at` пишет приложение из того же `Clock`, а не `now()` БД, поэтому окно считается по одним часам.
- [Комментарий с персональными данными уходит фрагментом в Telegram] → такой же риск уже есть для названий заявок и причин отказа. Фрагмент ограничен 200 символами.

## Migration Plan

1. Миграция 036 создаёт таблицу и индекс. Данных для переноса нет.
2. Выкатить бэкенд и портал вместе. Новый тип события регистрируется при старте модуля, до запуска outbox-воркера.
3. Задать `PORTAL_PUBLIC_URL` на стенде (тот же origin, что добавлен в `AUTH_ALLOWED_ORIGINS`).
4. Откат: `DROP TABLE portal_request_comments`. Невыданные события `portal.request_comment_posted` в outbox пометить обработанными вручную. Уведомления `request.comment-added` остаются в истории, переход по ним откроет заявку без ленты.
