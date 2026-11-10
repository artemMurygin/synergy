# Architecture: add-realtime-notifications

## Scope

**Backend:**
- общая инфраструктура доменных событий: transactional outbox, relay, общий `TransactionRunner`;
- новый модуль `notifications`: inbox, правила, каналы, REST, WebSocket-шлюз;
- доработка модуля `tasks`: событие `TaskCreated`, транзакции.

**Клиенты:**
- control-center: соединение в main, мост в preload, UI в renderer;
- manager-helper: соединение и системные уведомления в фоновом service worker, UI в side panel.

> Шаблон ссылается на `frontend/CLAUDE.md` и FSD (pages/features/kernel/shared). В этом репозитории их нет. Клиенты устроены так:
> - control-center: `main/` (main-процесс), `preload/`, `renderer/src/{features,lib/backend,stores,layouts,components/ui}`;
> - manager-helper: `src/{background,shared,sidepanel}`.
>
> Архитектура ниже следует фактической структуре клиентов. Для бэкенда приоритет у правил из `.claude/rules/code-style.md`: порт с суффиксом `Port`, адаптер без названия технологии. Существующие `Slonik*`-классы не переименовываются, кроме тех, что меняются в этом change по смыслу.

---

## Backend — Domain Model

### Entities

| Name | Status (new/existing) | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `Notification` | new | да | `id`, `recipientId`, `type: NotificationType`, `content: NotificationContent`, `target: NotificationTarget`, `actorId \| null`, `sourceEventId`, `createdAt`, `readAt \| null` | Уведомление в inbox получателя. Знает, прочитано ли оно |
| `Task` | existing (меняется) | да | без изменений полей | В `Task.create` добавляется `addEvent(new TaskCreatedEvent(...))` |
| `TaskCreatedEvent` | new | — (доменное событие, `extends DomainEvent`) | `aggregateId = taskId`, `title`, `creatorId`, `assigneeId \| null` | Факт создания задачи. Публичный контракт модуля `tasks` (`tasks/contracts`) |
| `NotificationCreatedEvent` | new | — (доменное событие) | `aggregateId = notificationId`, `recipientId` | Факт появления уведомления. Его слушают каналы доставки |
| `OutboxEvent` (запись) | new | — (модель инфраструктуры `shared`, не доменная) | `id`, `eventType`, `aggregateId`, `payload`, `metadata`, `createdAt` | Сохранённое доменное событие |
| `OutboxDelivery` (запись) | new | — (модель инфраструктуры `shared`) | `eventId`, `subscriber`, `status: pending \| done \| failed`, `attempts`, `nextAttemptAt`, `lastError`, `processedAt`, `claimToken` | Состояние доставки события одному подписчику |

### Aggregates

| Aggregate | Root entity | Входит в состав (entities/VO) | Инварианты, которые защищает |
|---|---|---|---|
| Notification | `Notification` | `NotificationType`, `NotificationContent`, `NotificationTarget` | `readAt` ставится один раз: повторное `markAsRead` его не меняет. `readAt >= createdAt`. Получатель и содержимое неизменны после создания |
| Task | `Task` | существующие VO задачи | Существующие. Событие `TaskCreated` порождается ровно один раз, только в `Task.create`, не при восстановлении из БД |

### Value Objects

| Name | Поля | Почему VO (immutable/self-validating) |
|---|---|---|
| `NotificationType` | union-литерал `'task.assigned'` (расширяется новыми типами) | Закрытый набор допустимых типов. Неизвестный тип из БД — ошибка валидации на границе |
| `NotificationContent` | `title` (1–200 символов), `body` (0–1000 символов) | Проверяет длину и обрезает пробелы. Сравнивается по значению |
| `NotificationTarget` | `type: 'task'`, `id: string` | Ссылка на объект для навигации. Без `id` или с неизвестным `type` не создаётся |
| `NotificationDraft` | `recipientId`, `type`, `content`, `target`, `actorId \| null` | Результат правила, ещё не уведомление: у него нет `id` и `createdAt` |
| `RetryPolicy` (shared/outbox) | `delaysMs: readonly number[]`, `maxAttempts` | Чистое вычисление `nextAttemptAt(attempt, now)` и `isExhausted(attempt)`, легко тестируется |

### Services

| Service | Слой (application/domain/infrastructure) | Ответственность |
|---|---|---|
| **shared / database** | | |
| `TransactionRunnerPort` / `TransactionRunner` | port: `database/postgres`; adapter: `database/postgres` (перенос из `auth`) | `run(work)`, `executor()` — соединение транзакции или пул, `afterCommit(callback)`. `auth` и `tasks` используют общий |
| `DomainEventPublisherPort` / `OutboxDomainEventPublisher` | port: `shared/ddd` (переименование); adapter: `shared/outbox/infrastructure` | Записывает события и строки доставок для подписчиков из реестра через `executor()` текущей транзакции. Вне транзакции бросает ошибку. Регистрирует `afterCommit` «разбудить relay» |
| `DomainEventRegistry` | `shared/outbox/application` | Реестр типов (`eventType → zod-схема → фабрика`) и подписчиков (`eventType → [{ name, handle }]`). Модули регистрируют в нём свои события и обработчики при `onModuleInit` |
| `OutboxRelay` | `shared/outbox/infrastructure` | Опрос по таймеру и по пробуждению. Забирает пачку доставок (`FOR UPDATE SKIP LOCKED`, порядок внутри агрегата), восстанавливает событие через реестр, вызывает подписчика, фиксирует `done`/ретрай/`failed`. Раз в час очищает обработанное. Пишет метрики |
| `OutboxStorePort` / `OutboxStore` | port: `shared/outbox/application`; adapter: `shared/outbox/infrastructure` | SQL-операции outbox: `insertEvents`, `claimDueDeliveries`, `markDone`, `scheduleRetry`, `markFailed`, `deleteProcessedBefore` |
| `OutboxSettings` | `shared/outbox/infrastructure` | Читает из env `OUTBOX_POLL_INTERVAL_MS`, `OUTBOX_BATCH_SIZE`, `OUTBOX_MAX_ATTEMPTS`, `OUTBOX_RETENTION_DAYS` |
| **tasks** | | |
| `CreateTaskUseCase` | application (existing, меняется) | `transactions.run(() => save + events.publish(task.pullDomainEvents()))` |
| `SlonikTaskRepository`, `SlonikTaskAttachmentRepository` | infrastructure (existing, меняются) | Пишут через `TransactionRunnerPort.executor()` вместо пула |
| `registerTaskEvents` | `tasks/contracts` | Регистрирует `tasks.task_created` (схема + фабрика) в `DomainEventRegistry` |
| **notifications** | | |
| `TaskAssignedOnCreateRule` | domain | `TaskCreatedEvent + actorLogin → NotificationDraft[]`: пусто, если ответственного нет или он совпадает с создателем |
| `CreateNotificationsUseCase` | application | В транзакции вставляет черновики идемпотентно (по `sourceEventId + recipientId + type`) и публикует `NotificationCreatedEvent` только для реально вставленных |
| `TaskCreatedSubscriber` | application | Подписчик outbox `notifications.task-assigned-on-create` на `tasks.task_created`: логин автора → правило → `CreateNotificationsUseCase` |
| `ChannelDeliverySubscriber` | application | По одному подписчику outbox на каждый канал (`notifications.channel.<channel>`) на `notifications.notification_created`: загружает уведомление и `unreadCount`, вызывает `channel.deliver` |
| `ListNotificationsUseCase` | application | Страница уведомлений получателя, `unreadOnly` |
| `GetUnreadCountUseCase` | application | Число непрочитанных |
| `MarkNotificationReadUseCase` | application | Отмечает одно уведомление прочитанным (404 для чужого или несуществующего), отправляет `notification.read` через `UserRealtimeEmitterPort`, возвращает `unreadCount` |
| `MarkAllNotificationsReadUseCase` | application | Отмечает все уведомления прочитанными, отправляет `notification.read { all: true }`, возвращает `0` |
| `NotificationRepositoryPort` / `NotificationRepository` | port: domain; adapter: infrastructure | Хранение уведомлений (сигнатуры ниже) |
| `NotificationChannelPort` | domain | Контракт канала: `channel`, `deliver(notification, unreadCount)`. Требование: идемпотентность |
| `RealtimeChannel` | infrastructure | Реализация канала: `UserRealtimeEmitterPort.emitToUser(recipientId, 'notification.created', ...)` |
| `UserRealtimeEmitterPort` / `UserRealtimeEmitter` | port: application; adapter: interface/ws | Отправка события в комнату `user:<id>` через сервер socket.io; при нескольких экземплярах — через Redis-адаптер |
| `NotificationsGateway` | interface/ws | Namespace `/notifications`. `handleConnection`: проверка origin и токена, отказ с кодом, вход в комнату, таймер разрыва по `exp`. Метрика числа соединений |
| `ConnectionAuthenticatorPort` / `ConnectionAuthenticator` | port: application; adapter: infrastructure (через экспортируемый `AccessTokenService` из `auth`) | `authenticate(token) → { userId, expiresAt }` или доменная ошибка (`token_invalid` / `token_expired` / `password_change_required`) |
| `UserDirectoryPort` / `UserDirectory` | port: domain; adapter: infrastructure | Логин пользователя по id для текста уведомления |
| `NotificationsController` | interface/http | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all` |
| `ClusteredIoAdapter` | `shared/realtime` | `IoAdapter` с `@socket.io/redis-adapter`; `pingInterval` 20 с, транспорт только `websocket`, CORS по `AUTH_ALLOWED_ORIGINS`. Подключается в `main.ts`. Передаёт pub-соединение в `RealtimeBrokerStatus` |
| `RealtimeBrokerStatusPort` / `RealtimeBrokerStatus` | port и adapter: `shared/realtime` | Готовность брокера рассылки между экземплярами. Gateway не отправляет событие и бросает ошибку, пока pub-соединение не готово, поэтому доставка уходит в ретрай outbox |

### Method Signatures (ключевые, по каждому сервису)

| Service.Method | Params | Returns | Краткое описание |
|---|---|---|---|
| `TransactionRunnerPort.run<T>` | `work: () => Promise<T>` | `Promise<T>` | Выполняет `work` в транзакции. Вложенный вызов переиспользует открытую |
| `TransactionRunnerPort.executor` | — | `CommonQueryMethods` | Соединение текущей транзакции или пул |
| `TransactionRunnerPort.afterCommit` | `callback: () => void` | `void` | Колбэк после успешного commit текущей транзакции. Вне транзакции — ошибка |
| `TransactionRunnerPort.isInTransaction` | — | `boolean` | Нужен публикатору для защиты от записи вне транзакции |
| `DomainEventPublisherPort.publish` | `events: readonly DomainEvent[]` | `Promise<void>` | Записывает события и доставки в текущую транзакцию |
| `DomainEventRegistry.registerEvent<TEvent>` | `eventType: string, schema: ZodType<TPayload>, toPayload: (event: TEvent) => TPayload, fromRecord: (record) => TEvent` | `void` | Регистрирует тип события |
| `DomainEventRegistry.subscribe` | `eventType: string, subscriber: { name: string; handle(event: DomainEvent): Promise<void> }` | `void` | Регистрирует подписчика. Имя уникально |
| `DomainEventRegistry.serialize` | `event: DomainEvent` | `{ eventType, payload, subscribers: string[] }` | Для публикатора |
| `DomainEventRegistry.restore` | `record: OutboxEventRecord` | `DomainEvent` или ошибка `UnknownEventError` / `InvalidEventPayloadError` | Для relay |
| `OutboxRelay.wake` | — | `void` | Внеочередной цикл обработки (дебаунс) |
| `OutboxRelay.processBatch` | — | `Promise<number>` | Один цикл: забрать, обработать, зафиксировать. Возвращает число обработанных доставок. Публичный для тестов |
| `OutboxStorePort.claimDueDeliveries` | `limit: number, now: Date, subscribers: readonly string[]` | `Promise<ClaimedDelivery[]>` | `FOR UPDATE SKIP LOCKED`, только первые необработанные в своём агрегате для своего подписчика и только подписчики, зарегистрированные на этом экземпляре (при поэтапном выкате старый экземпляр не трогает доставки новых подписчиков). Выдаёт новый `claimToken` аренды |
| `OutboxStorePort.markDone` | `lease: DeliveryLease, processedAt: Date` | `Promise<boolean>` | Пишет, только если аренда ещё принадлежит этому `claimToken`; `false` — аренду перехватили |
| `OutboxStorePort.scheduleRetry` | `lease: DeliveryLease, attempt: number, nextAttemptAt: Date, error: string` | `Promise<boolean>` | Ретрай, с той же проверкой аренды |
| `OutboxStorePort.markFailed` | `lease: DeliveryLease, attempts: number, error: string, processedAt: Date` | `Promise<boolean>` | Исчерпаны попытки или ядовитое событие, с той же проверкой аренды |
| `OutboxStorePort.releaseClaim` | `lease: DeliveryLease` | `Promise<boolean>` | Возвращает необработанную доставку в очередь без траты попытки, когда аренда пачки заканчивается |
| `RetryPolicy.nextAttemptAt` | `attempt: number, now: Date` | `Date` | Задержки 1 с, 5 с, 30 с, 2 мин, 10 мин, затем 10 мин |
| `Task.create` | существующие props | `Task` | Плюс `addEvent(TaskCreatedEvent)` |
| `CreateTaskUseCase.execute` | `actor: Actor, input: CreateTaskInput` | `Promise<TaskView>` | Сохранение задачи и событий атомарно |
| `TaskAssignedOnCreateRule.apply` | `event: TaskCreatedEvent, actorLogin: string` | `NotificationDraft[]` | Чистая функция |
| `TaskCreatedSubscriber.handle` | `event: TaskCreatedEvent` | `Promise<void>` | Правило → `CreateNotificationsUseCase` |
| `CreateNotificationsUseCase.execute` | `sourceEventId: string, drafts: readonly NotificationDraft[]` | `Promise<Notification[]>` | Возвращает только реально созданные |
| `ChannelDeliverySubscriber.handle` | `event: NotificationCreatedEvent` | `Promise<void>` | Уведомление + `unreadCount` → `channel.deliver`. Если уведомления уже нет, ничего не делает |
| `Notification.create` | `{ id, draft, sourceEventId, now }` | `Notification` | Фабрика |
| `Notification.markAsRead` | `now: Date` | `boolean` | `true`, если статус изменился |
| `NotificationRepositoryPort.insertIgnoringDuplicates` | `notifications: readonly Notification[]` | `Promise<Notification[]>` | `ON CONFLICT DO NOTHING RETURNING` |
| `NotificationRepositoryPort.findById` | `id: string` | `Promise<Notification \| null>` | — |
| `NotificationRepositoryPort.findPage` | `recipientId: string, query: { limit, page, isUnreadOnly }` | `Promise<{ items: Notification[]; total: number }>` | Новые первыми |
| `NotificationRepositoryPort.countUnread` | `recipientId: string` | `Promise<number>` | По частичному индексу |
| `NotificationRepositoryPort.markRead` | `id: string, recipientId: string, now: Date` | `Promise<'marked' \| 'already-read' \| 'not-found'>` | Одним `UPDATE … WHERE recipient_id = $` |
| `NotificationRepositoryPort.markAllRead` | `recipientId: string, now: Date` | `Promise<void>` | — |
| `ListNotificationsUseCase.execute` | `actor: Actor, query: NotificationPageQuery` | `Promise<NotificationPageView>` | — |
| `GetUnreadCountUseCase.execute` | `actor: Actor` | `Promise<{ unreadCount: number }>` | — |
| `MarkNotificationReadUseCase.execute` | `actor: Actor, notificationId: string` | `Promise<{ unreadCount: number }>` | `NotificationNotFoundError` → 404 |
| `MarkAllNotificationsReadUseCase.execute` | `actor: Actor` | `Promise<{ unreadCount: 0 }>` | — |
| `NotificationChannelPort.deliver` | `notification: Notification, unreadCount: number` | `Promise<void>` | Ошибка → ретрай через outbox |
| `UserRealtimeEmitterPort.emitToUser` | `userId: string, event: RealtimeEvent` | `Promise<void>` | `RealtimeEvent` — discriminated union `notification.created` / `notification.read` |
| `ConnectionAuthenticatorPort.authenticate` | `token: string` | `{ userId: string; expiresAt: Date }` | Бросает `ConnectionRejectedError(code)` |
| `NotificationsGateway.handleConnection` | `client: Socket` | `Promise<void>` | Origin → токен → комната → таймер `exp` |

**Контракт событий WebSocket** (namespace `/notifications`, сервер → клиент):
- `notification.created` — `{ notification: NotificationDto, unreadCount }`;
- `notification.read` — `{ notificationIds: string[] } | { all: true }` плюс `unreadCount`;
- `connection_error` — `{ code: 'token_invalid' | 'token_expired' | 'password_change_required' | 'origin_not_allowed' }`;
- `auth_expired`.

`NotificationDto`: `{ id, type, title, body, target: { type, id }, actorId, createdAt, readAt }`, даты в ISO 8601.

---

## Frontend — UI Model

### Pages

| Page | Route | Структура (ui / +model / +mediator) | Назначение |
|---|---|---|---|
| control-center: `AppShell` (existing) | роутера нет, раздел в `ui.store.section` | ui + подключение `NotificationsStream` и `NotificationToaster` | Оболочка приложения: монтирует поток уведомлений и тосты один раз на сессию |
| control-center: `TasksPage` (existing) | `section = 'tasks'` | без изменений; открытие задачи через `tasks.store.selectTask(id)` | Цель перехода из уведомления |
| manager-helper: side panel `App` (existing, меняется) | секция `chat` / `tasks` в `active-section`, плюс оверлей уведомлений | ui + `use-notifications` (model) + `use-pending-target` | Шапка с кнопкой уведомлений, оверлей списка, переход к задаче |
| manager-helper: `TasksApp` (existing, меняется) | `section = 'tasks'` | новый проп `requestedTaskId` → `TasksSplitView` открывает детали | Цель перехода из уведомления |

### Features (переиспользуемые модули с бизнес-логикой)

| Feature | Статус (new/existing) | Публичный API (index.ts) | model/ (хуки, api.ts) | Назначение |
|---|---|---|---|---|
| control-center `main/notifications` | new | `createNotificationsSocket(deps)`, `registerNotificationsIpc(socket, getWindows)` | `notifications-socket.ts` (жизненный цикл по `AuthService.onChange`, `auth` из `getAccessToken`), `notifications-events.ts` (zod-схемы событий), `notifications-ipc.ts` | Соединение socket.io в main-процессе, пересылка событий и состояния в окна |
| control-center `preload/notifications-bridge` | new | `window.api.notifications.{ onEvent, onConnectionState, getConnectionState }` | `notifications-bridge-impl.ts` | Мост IPC → renderer без токена |
| control-center `lib/backend/notifications.*` | new | `notifications.api.ts`, `notifications.schema.ts`, `notifications.queries.ts` | `notificationsInfiniteQuery`, `unreadCountQuery`, `useMarkNotificationRead`, `useMarkAllNotificationsRead`, `applyNotificationEvent(queryClient, event)` | REST через `cc-api` и TanStack Query по образцу `tasks.queries` |
| control-center `features/notifications` | new | `NotificationsButton`, `NotificationsStream`, `NotificationToaster` | `use-notifications-stream.ts`, `use-open-notification.ts`, `stores/notifications.store.ts` (очередь тостов, показанные `id`) | UI уведомлений в рейле, тосты, переход к задаче |
| control-center `main/cc-api-protocol` | existing (меняется) | — | `ALLOWED_PREFIXES += '/notifications'` | Прокси REST |
| manager-helper `background/notifications` | new | `startBackgroundNotifications()` (вызывается из `background/index.ts`) | `notifications-socket.ts`, `system-notifier.ts`, `unread-badge.ts`, `missed-notifications.ts`, `panel-port-hub.ts`, `connection-watchdog.ts`, `seen-store.ts` | Фоновое соединение, системные уведомления, бейдж, пропущенное, связь с панелью |
| manager-helper `shared/notifications` | new | `notifications-api.ts`, `notifications-schema.ts`, `panel-protocol.ts`, `pending-target.ts`, `format-badge-count.ts` | — | Общие для SW и панели: REST через `authFetch`, zod-схемы, сообщения порта, цель перехода в `chrome.storage.session` |
| manager-helper `shared/auth/session-channel` | existing (меняется) | `startSession()`, `onSessionStarted(listener)` | — | Сигнал «сессия началась» для SW |
| manager-helper `sidepanel/notifications` | new | `NotificationsButton`, `NotificationsOverlay`, `NotificationToast` | `use-notifications.ts`, `use-background-port.ts`, `use-pending-target.ts` | UI уведомлений в панели. События идут из SW через порт |
| manager-helper `manifest.config.ts` | existing (меняется) | — | `permissions += notifications, alarms`; `minimum_chrome_version: '116'` | — |

### UI-компоненты (page-local и shared)

| Component | Слой (pages/<Page>/ui · shared/ui-kit · shared/ui legacy) | Props (основные) | Назначение |
|---|---|---|---|
| `NotificationsButton` (cc) | `features/notifications`, монтируется в `layouts/NavRail` | — (сам читает `unreadCountQuery`) | Кнопка-колокольчик в рейле с бейджем и поповером списка |
| `UnreadBadge` (cc) | `features/notifications` | `count: number` | `99+`, скрыт при 0 |
| `NotificationsPopover` (cc) | `features/notifications`, на `components/ui/popover` | `onOpenNotification(n)` | Список: шапка с «Прочитать все», бесконечная прокрутка, состояния загрузки, пустое и ошибки |
| `NotificationItem` (cc) | `features/notifications` | `notification`, `onOpen` | Строка: иконка по `type`, заголовок, текст, относительное время, выделение непрочитанного |
| `NotificationToaster` / `NotificationToast` (cc) | `features/notifications` | очередь из `notifications.store` | Тосты в правом нижнем углу, автоскрытие через 6 с, клик ведёт к объекту |
| `NotificationsButton` (mh) | `sidepanel/notifications`, слот в `PanelHeader` | `unreadCount`, `onClick` | Кнопка в шапке панели со счётчиком |
| `NotificationsOverlay` (mh) | `sidepanel/notifications` | `items`, `state`, `onOpen`, `onReadAll`, `onLoadMore`, `onClose` | Компактный список поверх текущей секции |
| `NotificationItem` (mh) | `sidepanel/notifications` | `notification`, `onOpen` | Строка списка |
| `NotificationToast` (mh) | `sidepanel/notifications` | `notification`, `onOpen`, `onDismiss` | Всплывающее уведомление в панели |
| `PanelHeader` (mh) | existing (меняется) | новый слот `notifications?: ReactNode` | Место для кнопки уведомлений |

### Hooks (model)

| Hook | Расположение | Тип (state-хук / query options factory) | Возвращает |
|---|---|---|---|
| `notificationsInfiniteQuery()` | cc `lib/backend/notifications.queries.ts` | `infiniteQueryOptions` | Страницы `NotificationPage` |
| `unreadCountQuery()` | cc `lib/backend/notifications.queries.ts` | `queryOptions` | `{ unreadCount }` |
| `useMarkNotificationRead()` / `useMarkAllNotificationsRead()` | cc `lib/backend/notifications.queries.ts` | mutation-хуки | Оптимистично обновляют кэш и `unreadCount` |
| `applyNotificationEvent(queryClient, event)` | cc `lib/backend/notifications.queries.ts` | функция обновления кэша | Вставляет новое уведомление с дедупликацией по `id`, отмечает прочитанные, ставит `unreadCount` |
| `useNotificationsStream()` | cc `features/notifications` | state-хук-эффект | Подписка на `window.api.notifications`: события → `applyNotificationEvent` и тост; `online` → `invalidateQueries`; выход → очистка кэша |
| `useOpenNotification()` | cc `features/notifications` | хук действия | `(n) => markRead + ui.setSection('tasks') + tasks.selectTask(n.target.id)` |
| `useNotifications()` | mh `sidepanel/notifications` | state-хук | `{ items, unreadCount, state, loadMore, markRead, markAllRead, toast }`; REST + события порта, дедупликация по `id` |
| `useBackgroundPort(onMessage)` | mh `sidepanel/notifications` | state-хук | Подключение `chrome.runtime.connect({ name: 'notifications' })` с переподключением; состояние соединения SW |
| `usePendingTarget(onTarget)` | mh `sidepanel/notifications` | state-хук-эффект | При монтировании забирает цель из `chrome.storage.session` и следит за её изменениями |

### Паттерны, которые нужно учесть при проектировании

- [x] Публичный API фичи — только через `index.ts`. Нужно для `features/notifications` в control-center.
- [x] Запросы к бэкенду — через query options factory: `queryOptions` / `infiniteQueryOptions` в `lib/backend/notifications.queries.ts`, как в `tasks.queries`. В manager-helper TanStack Query нет, там хук с `useState` по образцу `use-chat-sessions`.
- [x] Ошибки API нормализуются через существующий `lib/backend/errors.ts` (в control-center нет `shared/errors/apiError.ts`).
- [ ] `mediator/`-компонент — не нужен.
- [ ] Именованные слоты — только в `PanelHeader` (manager-helper): новый проп-слот `notifications`.
- [x] `isInitialLoad` / `isRefreshing` — список уведомлений не должен мигать скелетоном при фоновой синхронизации после переподключения.
- [ ] `shared/ui-kit/` — в клиентах такого слоя нет. В control-center используются `components/ui` (shadcn, `popover`), в manager-helper — локальные компоненты панели.

---

## Diagrams

### 1. Domain Entity Interaction
Связи `Task`, `TaskCreatedEvent`, `OutboxEvent`, `OutboxDelivery`, `Notification` и VO `NotificationContent`, `NotificationTarget`, `NotificationType`, `NotificationCreatedEvent`.

Miro link: https://miro.com/app/board/uXjVEP6UhAI=/?moveToWidget=3458764690024992165

### 2. External Modules Interaction
Модули `tasks`, `notifications`, `auth`, `shared/outbox`; Postgres, Redis; control-center (main → preload → renderer), manager-helper (SW ↔ side panel, `chrome.notifications`, бейдж). Направление вызовов, sync/async.

Miro link: https://miro.com/app/board/uXjVEP6UhAI=/?moveToWidget=3458764690024992166

### 3. Layer Interaction — от Controller до Response
Последовательность «`POST /tasks` → транзакция (задача + outbox) → 201 → relay → `TaskCreatedSubscriber` → `CreateNotificationsUseCase` (уведомление + outbox) → relay → `RealtimeChannel` → Redis → Gateway → клиенты». Плюс ветка ретрая.

Miro link: https://miro.com/app/board/uXjVEP6UhAI=/?moveToWidget=3458764690024992167

---

## Уточнения после ui-design

- **cc `NotificationsButton`** стоит в нижней группе `NavRail`, над темой и аватаром. Подписи нет, вместо неё тултип и `aria-label="Уведомления"`.
- **cc `NotificationsPopover`:** «Прочитать все» неактивна при `unreadCount = 0`; в шапке бейдж «N новых».
- **cc `notifications.store`:** на экране не больше 3 тостов, новые снизу; таймер 6 с на паузе при наведении. У cc `NotificationToast` есть `onDismiss` (крестик).
- **mh `NotificationsOverlay`:**
  - новый проп `unreadCount` для бейджа «N новых»;
  - две раскладки: на узкой панели оверлей на всю секцию под шапкой, при ширине ≥ брейкпоинта `TasksSplitView` — выпадающий список 400 px под кнопкой.
- **mh, задача не найдена:** при переходе к удалённой задаче показывается сообщение «Задача не найдена» (`LA1Op`), уведомление остаётся прочитанным.
- **Форматтер относительного времени:** полный режим для cc («2 мин назад», «вчера», «12 окт») и короткий для mh («2 мин», «1 ч»).
- **Ошибка подгрузки следующей страницы:** строка с «Повторить» внизу списка, в обоих клиентах.

## Confirmation Checklist

- [x] Названия entity/aggregate/VO согласованы
- [x] Названия и сигнатуры ключевых методов сервисов согласованы
- [x] Слои (pages/features/kernel/shared), структура model/ui и паттерны фронта согласованы
- [x] Диаграммы взаимодействия отражают ожидаемую реализацию
- [x] Пользователь подтвердил переход к tasks.md
