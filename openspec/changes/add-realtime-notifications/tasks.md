> Интеграционные тесты бэкенда с PostgreSQL запускаются только при заданном `PROGRAMS_ETL_TEST_ADMIN_URL`, как в существующих `postgres-*.spec.ts`. Без него шаг red/green для таких тестов нельзя считать пройденным: перед прогоном переменную нужно задать (`npm run infra:up`).
>
> Node ID фреймов для UI-задач берутся из `ui-design.md` (`design/synergy-design-kit.pen`; читать через `mcp__pencil__*`, не Read/Grep). Корневые разделы: control-center `04 · Уведомления` (`s43f7`), manager-helper `09 · Уведомления` (`RCYNX`); новые компоненты кита — в `vNTmH`.

## 1. Подготовка бэкенда

- [x] 1.1 Добавить в `backend` зависимости `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`, `@socket.io/redis-adapter`, в devDependencies — `socket.io-client` (для e2e). Проверка: `npm install` без ошибок, `npm run typecheck` зелёный.
- [x] 1.2 Описать в `shared/config/env.schema.ts` и `.env.example` переменные `OUTBOX_POLL_INTERVAL_MS` (1000), `OUTBOX_BATCH_SIZE` (50), `OUTBOX_MAX_ATTEMPTS` (10), `OUTBOX_RETENTION_DAYS` (7), `NOTIFICATIONS_WS_PING_INTERVAL_MS` (20000) с валидацией и значениями по умолчанию. Проверка: тест схемы env (рядом с существующими) на значения по умолчанию и отказ при невалидных значениях — зелёный.
- [x] 1.3 Написать тест миграций `outbox-migration.spec.ts` и `notifications-migration.spec.ts` (по образцу `tasks-migration.spec.ts`):
  - таблицы `outbox_events`, `outbox_deliveries`, `notifications`, их колонки и ограничения;
  - уникальный `(source_event_id, recipient_id, type)`;
  - первичный ключ `(event_id, subscriber)`;
  - частичные индексы.
- [x] 1.4 Прогнать тесты из 1.3 и зафиксировать, что они падают (red): миграций ещё нет.
- [x] 1.5 Написать `db/migrations/016_outbox.sql` и `017_notifications.sql` по design.md, раздел 7.
- [x] 1.6 Прогнать тесты из 1.3 и зафиксировать, что они зелёные (green), регрессий в соседних тестах миграций нет.

## 2. Общий TransactionRunner

- [x] 2.1 Написать тесты `database/postgres/transaction-runner.spec.ts` (интеграционные):
  - `run` коммитит и откатывает;
  - вложенный `run` переиспользует транзакцию;
  - `executor()` внутри и вне транзакции;
  - `afterCommit` вызывается только после успешного commit и не вызывается при откате;
  - `afterCommit` вне транзакции бросает ошибку;
  - `isInTransaction`.
- [x] 2.2 Прогнать тесты из 2.1 и зафиксировать, что они падают (red): общего runner'а ещё нет.
- [x] 2.3 Перенести порт `TransactionRunnerPort` и адаптер `TransactionRunner` из `modules/auth` в `database/postgres`, добавить `afterCommit` и `isInTransaction`, экспортировать из `PostgresModule`. Переключить `auth` на общий runner и удалить старые файлы из `auth`.
- [x] 2.4 Прогнать тесты из 2.1 и все тесты `modules/auth` и зафиксировать, что они зелёные (green): логин, refresh, logout и смена пароля не сломались.

## 3. RetryPolicy

- [x] 3.1 Написать тесты `shared/outbox/domain/retry-policy.spec.ts`:
  - задержки 1 с, 5 с, 30 с, 2 мин, 10 мин, затем 10 мин;
  - `nextAttemptAt` не уменьшается;
  - `isExhausted` на `maxAttempts`.
- [x] 3.2 Прогнать тесты из 3.1 и зафиксировать, что они падают (red).
- [x] 3.3 Реализовать VO `RetryPolicy`.
- [x] 3.4 Прогнать тесты из 3.1 и зафиксировать, что они зелёные (green).

## 4. DomainEventRegistry

- [x] 4.1 Написать тесты `shared/outbox/application/domain-event-registry.spec.ts`:
  - регистрация типа и подписчиков;
  - `serialize` возвращает `eventType`, payload и список подписчиков;
  - `restore` восстанавливает событие с исходными `id` и `metadata`;
  - неизвестный тип → `UnknownEventError`;
  - payload не по схеме → `InvalidEventPayloadError`;
  - повторное имя подписчика и повторный тип — ошибка;
  - нигде нет `as`.
- [x] 4.2 Прогнать тесты из 4.1 и зафиксировать, что они падают (red).
- [x] 4.3 Реализовать `DomainEventRegistry`. Переименовать порт `DomainEventPublisher` в `DomainEventPublisherPort` в `shared/ddd` и обновить экспорты.
- [x] 4.4 Прогнать тесты из 4.1 и зафиксировать, что они зелёные (green), `npm run typecheck` зелёный.

## 5. Outbox: публикатор и хранилище

- [x] 5.1 Написать интеграционные тесты `shared/outbox/infrastructure/outbox.spec.ts` для `OutboxDomainEventPublisher` и `OutboxStore`:
  - публикация в транзакции пишет событие и по строке доставки на каждого подписчика;
  - откат транзакции не оставляет событий;
  - публикация вне транзакции бросает ошибку;
  - после commit вызывается пробуждение relay;
  - `claimDueDeliveries` отдаёт только `pending` с наступившим `next_attempt_at`, при конкурентном захвате двумя соединениями не отдаёт одну доставку дважды и не отдаёт следующую доставку агрегата, пока предыдущая не закрыта;
  - работают `markDone`, `scheduleRetry`, `markFailed`, `deleteProcessedBefore` (не трогает `failed` и незавершённые).
- [x] 5.2 Прогнать тесты из 5.1 и зафиксировать, что они падают (red).
- [x] 5.3 Реализовать `OutboxStorePort`/`OutboxStore`, `OutboxDomainEventPublisher` и `OutboxSettings` (env из 1.2).
- [x] 5.4 Прогнать тесты из 5.1 и зафиксировать, что они зелёные (green).

## 6. OutboxRelay

- [x] 6.1 Написать тесты `shared/outbox/infrastructure/outbox-relay.spec.ts`. Unit — с фейковым хранилищем и часами. Интеграционные — для сценариев падения и конкурентности:
  - успешная доставка → `done`;
  - ошибка подписчика → `scheduleRetry` по `RetryPolicy`, другие подписчики того же события не вызываются повторно;
  - исчерпаны попытки → `failed`, лог `error` с `eventId` и `subscriber`, метрика;
  - неизвестный тип или невалидный payload → сразу `failed`;
  - `wake` запускает внеочередной цикл;
  - событие, записанное «до падения», обрабатывается новым экземпляром relay;
  - два relay параллельно не обрабатывают одну доставку дважды;
  - очистка удаляет старые обработанные события;
  - метрики `outbox_deliveries_processed_total`, `outbox_pending_deliveries`, `outbox_delivery_lag_seconds` обновляются.
- [x] 6.2 Прогнать тесты из 6.1 и зафиксировать, что они падают (red).
- [x] 6.3 Реализовать `OutboxRelay`:
  - таймер опроса и `wake` с дебаунсом;
  - очистка раз в час;
  - корректная остановка на `onModuleDestroy`.
  Собрать глобальный `OutboxModule`: registry, publisher, relay, store, settings.
- [x] 6.4 Прогнать тесты из 6.1 и зафиксировать, что они зелёные (green), регрессий нет.

## 7. Tasks: событие TaskCreated и атомарное создание

- [x] 7.1 Написать тесты:
  - `tasks/domain/task.spec.ts`: `Task.create` порождает ровно один `TaskCreatedEvent` с `taskId`, `title`, `creatorId`, `assigneeId`, а восстановление из БД событий не порождает;
  - `tasks/contracts/task-created.event.spec.ts`: сериализация и восстановление через registry;
  - `create-task.use-case` (`task-crud.use-cases.spec.ts`): задача и события сохраняются внутри `transactions.run`, а ошибка публикации откатывает задачу;
  - интеграционный в `postgres-tasks.repositories.spec.ts`: задача, наблюдатели и outbox коммитятся вместе, сбой на наблюдателях откатывает всё.
- [x] 7.2 Прогнать тесты из 7.1 и зафиксировать, что они падают (red).
- [x] 7.3 Реализовать:
  - `TaskCreatedEvent` и `registerTaskEvents` в `tasks/contracts`;
  - `addEvent` в `Task.create`;
  - перевод `SlonikTaskRepository` и `SlonikTaskAttachmentRepository` на `TransactionRunnerPort.executor()`;
  - `CreateTaskUseCase` через `transactions.run` и `DomainEventPublisherPort`;
  - обновление `test-doubles.ts` и `tasks.module.ts`.
- [x] 7.4 Прогнать тесты из 7.1, все тесты `modules/tasks` (включая `tasks-flow.e2e.spec.ts`) и зафиксировать, что они зелёные (green).

## 8. Notifications: доменная модель и правило

- [x] 8.1 Написать тесты `notifications/domain/*.spec.ts`:
  - `NotificationContent`: обрезка пробелов, длина заголовка 1–200, текста 0–1000;
  - `NotificationTarget`: требует `id`, тип только `task`;
  - `NotificationType`: неизвестный тип отклоняется;
  - `Notification.create`;
  - `markAsRead`: ставит `readAt` один раз и возвращает `false` при повторе;
  - `TaskAssignedOnCreateRule`: ответственный ≠ автор → один черновик с текстом по spec; ответственный = автор → пусто; без ответственного → пусто.
- [x] 8.2 Прогнать тесты из 8.1 и зафиксировать, что они падают (red).
- [x] 8.3 Реализовать агрегат `Notification`, VO `NotificationType`, `NotificationContent`, `NotificationTarget`, `NotificationDraft`, доменные ошибки (`NotificationNotFoundError`), правило `TaskAssignedOnCreateRule` и `NotificationCreatedEvent`.
- [x] 8.4 Прогнать тесты из 8.1 и зафиксировать, что они зелёные (green).

## 9. NotificationRepository

- [x] 9.1 Написать интеграционные тесты `notifications/infrastructure/notification.repository.spec.ts`:
  - `insertIgnoringDuplicates` возвращает только вставленные, дубль по `(source_event_id, recipient_id, type)` игнорируется;
  - `findPage`: новые первыми, `total`, `isUnreadOnly`, только свои;
  - `countUnread`;
  - `markRead` возвращает `marked`, `already-read` (без изменения `read_at`) или `not-found` (для чужого);
  - `markAllRead`;
  - запись идёт через транзакционный executor.
- [x] 9.2 Прогнать тесты из 9.1 и зафиксировать, что они падают (red).
- [x] 9.3 Реализовать `NotificationRepositoryPort` и `NotificationRepository` с zod-валидацией строк, а также `UserDirectoryPort` и `UserDirectory` (логин по id).
- [x] 9.4 Прогнать тесты из 9.1 и зафиксировать, что они зелёные (green).

## 10. Создание уведомлений из событий

- [x] 10.1 Написать тесты:
  - `CreateNotificationsUseCase`: в одной транзакции вставляет уведомления и публикует `NotificationCreatedEvent` только для вставленных; повтор с тем же `sourceEventId` не создаёт дублей и событий;
  - `TaskCreatedSubscriber`: событие → логин автора → правило → use-case; для задачи «на себя» ничего не создаёт; ошибка каталога пользователей пробрасывается (уйдёт в ретрай outbox).
- [x] 10.2 Прогнать тесты из 10.1 и зафиксировать, что они падают (red).
- [x] 10.3 Реализовать `CreateNotificationsUseCase` и `TaskCreatedSubscriber`. Зарегистрировать подписчика `notifications.task-assigned-on-create` и событие `notifications.notification_created` в `DomainEventRegistry` на `onModuleInit`.
- [x] 10.4 Прогнать тесты из 10.1 и зафиксировать, что они зелёные (green).

## 11. Чтение и отметка прочитанным

- [x] 11.1 Написать тесты use-cases:
  - `ListNotificationsUseCase`: пагинация, `unreadOnly`, только свои;
  - `GetUnreadCountUseCase`;
  - `MarkNotificationReadUseCase`: возвращает `unreadCount` и отправляет `notification.read { notificationIds }` через фейковый `UserRealtimeEmitterPort`; повтор не меняет `readAt`; чужое или несуществующее → `NotificationNotFoundError`;
  - `MarkAllNotificationsReadUseCase`: `unreadCount: 0` и `notification.read { all: true }`.
- [x] 11.2 Прогнать тесты из 11.1 и зафиксировать, что они падают (red).
- [x] 11.3 Реализовать четыре use-case и view-модели (`NotificationPageView`, `NotificationDto`).
- [x] 11.4 Прогнать тесты из 11.1 и зафиксировать, что они зелёные (green).

## 12. REST API уведомлений

- [x] 12.1 Написать тесты `notifications.controller.spec.ts` и e2e `notifications-api.e2e.spec.ts` по spec `notifications`:
  - `GET /notifications`: 200, пагинация, `unreadOnly`, 400 на недопустимый `limit` или страницу;
  - `GET /notifications/unread-count`;
  - `POST /notifications/:id/read`: 200 и 404 для чужого;
  - `POST /notifications/read-all`;
  - 401 без токена;
  - отказ для пользователя с временным паролем.
- [x] 12.2 Прогнать тесты из 12.1 и зафиксировать, что они падают (red).
- [x] 12.3 Реализовать `NotificationsController`: схемы запросов и ответов, Swagger, явные `@HttpCode`, регистрация статусов доменных ошибок (по образцу `tasks-error-status.ts`).
- [x] 12.4 Прогнать тесты из 12.1 и зафиксировать, что они зелёные (green).

## 13. WebSocket: аутентификация и шлюз

- [x] 13.1 Написать тесты:
  - `ConnectionAuthenticator`: валидный токен → `{ userId, expiresAt }`; истёкший → `token_expired`; подделанный или пустой → `token_invalid`; `mcp=true` → `password_change_required`;
  - `NotificationsGateway` (с реальным socket.io-сервером на случайном порту и `socket.io-client`):
    - подключение с токеном в `handshake.auth` входит в комнату `user:<id>`;
    - без токена, с плохим токеном или временным паролем → событие `connection_error` с кодом и разрыв;
    - чужой браузерный origin → отказ, отсутствие origin → принят;
    - по `exp` → `auth_expired` и разрыв;
    - токен в query игнорируется;
    - метрика числа соединений;
  - `UserRealtimeEmitter`: событие уходит во все соединения пользователя и не уходит другим.
- [x] 13.2 Прогнать тесты из 13.1 и зафиксировать, что они падают (red).
- [x] 13.3 Реализовать:
  - `ConnectionAuthenticatorPort` и `ConnectionAuthenticator` (`auth` экспортирует `AccessTokenService`, если сейчас не экспортирует);
  - `NotificationsGateway` (namespace `/notifications`, только транспорт `websocket`);
  - `UserRealtimeEmitterPort` и `UserRealtimeEmitter`;
  - `RedisIoAdapter` в `shared/realtime` (`ioredis` pub/sub, `pingInterval` из env, CORS по `AUTH_ALLOWED_ORIGINS`) и подключение в `main.ts`.
- [x] 13.4 Прогнать тесты из 13.1 и зафиксировать, что они зелёные (green).

## 14. Каналы доставки

- [x] 14.1 Написать тесты:
  - `RealtimeChannel`: вызывает `emitToUser(recipientId, notification.created { notification, unreadCount })`, ошибка эмиттера пробрасывается;
  - `ChannelDeliverySubscriber`: по `NotificationCreatedEvent` загружает уведомление и `unreadCount` и вызывает канал; если уведомления нет, ничего не делает;
  - для двух фейковых каналов создаются два подписчика outbox с разными именами, а ошибка одного не повторяет другой (через relay из группы 6).
- [x] 14.2 Прогнать тесты из 14.1 и зафиксировать, что они падают (red).
- [x] 14.3 Реализовать:
  - `NotificationChannelPort` и multi-provider токен каналов;
  - `RealtimeChannel` и `ChannelDeliverySubscriber`;
  - регистрацию подписчика `notifications.channel.<channel>` для каждого канала;
  - метрику `notification_channel_failures_total`.
- [x] 14.4 Прогнать тесты из 14.1 и зафиксировать, что они зелёные (green).

## 15. Сборка модуля и сквозной сценарий бэкенда

- [x] 15.1 Написать e2e `notifications-flow.e2e.spec.ts`:
  - A создаёт задачу с ответственным B через `POST /tasks` → 201;
  - два `socket.io-client` пользователя B получают `notification.created` не позже 2 с с правильным текстом и `unreadCount = 1`;
  - соединение A ничего не получает;
  - `GET /notifications` у B возвращает уведомление;
  - `POST /notifications/:id/read` → второе соединение B получает `notification.read`;
  - задача «на себя» уведомления не создаёт;
  - при временно падающем `RealtimeChannel` уведомление доставляется после ретрая.
- [x] 15.2 Прогнать тест из 15.1 и зафиксировать, что он падает (red): модуль не собран.
- [x] 15.3 Собрать `NotificationsModule` (контроллер, шлюз, use-cases, подписчики, адаптеры), подключить `OutboxModule` и `NotificationsModule` в `app.module.ts`, регистрацию событий `tasks` — в `TasksModule.onModuleInit`.
- [x] 15.4 Прогнать тест из 15.1 и весь `npm test` бэкенда и зафиксировать, что всё зелёное (green). `npm run lint` и `npm run typecheck` без ошибок.

## 16. control-center: соединение в main-процессе

- [x] 16.1 Добавить `socket.io-client` в `control-center`. Проверка: `npm install` и `npm run typecheck` зелёные.
- [x] 16.2 Написать тесты `main/notifications/notifications-socket.test.ts`, `notifications-ipc.test.ts`, `notifications-events.test.ts` и дополнить `cc-api-protocol.test.ts`:
  - подключение при переходе `AuthService` в `authenticated`, отключение при `unauthenticated`;
  - `auth` берёт свежий токен через `getAccessToken` на каждое переподключение;
  - состояния `connecting`/`online`/`offline` передаются в окна;
  - невалидное по zod событие отбрасывается с логом;
  - события пересылаются через `webContents.send`;
  - `/notifications` пропускается прокси.
- [x] 16.3 Прогнать тесты из 16.2 и зафиксировать, что они падают (red).
- [x] 16.4 Реализовать `NotificationsSocket`, `registerNotificationsIpc` и zod-схемы событий, подключить их в `main/index.ts`, добавить `/notifications` в `ALLOWED_PREFIXES`.
- [x] 16.5 Прогнать тесты из 16.2 и зафиксировать, что они зелёные (green), регрессий в тестах `main` нет.

## 17. control-center: мост preload

- [x] 17.1 Написать тест `preload/notifications-bridge-impl.test.ts`:
  - `onEvent` и `onConnectionState` подписывают и отписывают слушателей IPC;
  - `getConnectionState` возвращает текущее состояние;
  - токен через мост не передаётся.
- [x] 17.2 Прогнать тест из 17.1 и зафиксировать, что он падает (red).
- [x] 17.3 Реализовать `createNotificationsBridge`, добавить в `window.api` и типы `preload/index.d.ts`.
- [x] 17.4 Прогнать тест из 17.1 и зафиксировать, что он зелёный (green).

## 18. control-center: REST и кэш уведомлений

- [x] 18.1 Написать тесты:
  - `lib/backend/notifications.schema.test.ts`, `notifications.api.test.ts`;
  - `notifications.queries.test.tsx`:
    - `notificationsInfiniteQuery` и `unreadCountQuery`;
    - `useMarkNotificationRead` и `useMarkAllNotificationsRead` обновляют кэш оптимистично и откатывают при ошибке;
    - `applyNotificationEvent`: `created` вставляет первым и дедуплицирует по `id`, `read` отмечает и выставляет `unreadCount`, `read all`.
- [x] 18.2 Прогнать тесты из 18.1 и зафиксировать, что они падают (red).
- [x] 18.3 Реализовать `notifications.schema.ts`, `notifications.api.ts` и `notifications.queries.ts` по образцу `tasks.*`.
- [x] 18.4 Прогнать тесты из 18.1 и зафиксировать, что они зелёные (green).

## 19. control-center: поток событий и переход к задаче

- [x] 19.1 Написать тесты:
  - `stores/notifications.store.test.ts`: очередь тостов, не больше 3 одновременно, без повторного тоста для показанного `id`, автоскрытие через 6 с, пауза таймера при наведении, `dismiss`;
  - `features/notifications/use-notifications-stream.test.tsx`: событие → кэш и тост; `online` → `invalidateQueries`; выход → очистка кэша;
  - `use-open-notification.test.tsx`: отметка прочитанным, `setSection('tasks')`, `selectTask(id)`, сообщение «Задача не найдена» при 404 задачи.
- [x] 19.2 Прогнать тесты из 19.1 и зафиксировать, что они падают (red).
- [x] 19.3 Реализовать `notifications.store`, `useNotificationsStream` и `useOpenNotification`.
- [x] 19.4 Прогнать тесты из 19.1 и зафиксировать, что они зелёные (green).

## 20. control-center: UI уведомлений (по ui-design.md)

- [x] 20.1 Написать тесты компонентов:
  - `UnreadBadge`: скрыт при 0, `99+` при 100 и больше;
  - `NotificationsButton`: счётчик из `unreadCountQuery`, открытие поповера;
  - `NotificationsPopover`: список, выделение непрочитанных, бейдж «N новых», загрузка, пусто, ошибка с «Повторить», подгрузка и её ошибка с «Повторить», «Прочитать все» неактивна при 0 непрочитанных;
  - `NotificationItem`: заголовок, текст, относительное время, клик;
  - `NotificationToaster`: показ, клик, крестик (`onDismiss`), стопка не больше 3;
  - форматтер относительного времени: полный режим («2 мин назад», «вчера», «12 окт»).
- [x] 20.2 Прогнать тесты из 20.1 и зафиксировать, что они падают (red).
- [x] 20.3 Сверстать кнопку в рейле и `UnreadBadge` по фрейму `GCorB` (состояния `JjGUZ` 0, `yNHEb` N, `oXX65` 99+, `wFqqo` наведение с тултипом; компонент `Notifications Button / Master` `ekWsX`) (design/synergy-design-kit.pen, читать через `mcp__pencil__execute`/Get) и встроить в `layouts/NavRail.tsx`.
- [x] 20.4 Сверстать `NotificationsPopover` и `NotificationItem` по фрейму `m6BYlc` (список `xWCMl`, загрузка `olEcF`, пусто `sk3wK`, ошибка `OzbWE`, подгрузка `w58qfT`, после «Прочитать все» `CMuzQ`; общий вид `Cxosu`, строка — `Notification Item / Master` `MaZJj`) и сверить со скриншотом.
- [x] 20.5 Сверстать `NotificationToaster` по фрейму `r2IqK` (один `t6HWih`, стопка `P453g`, наведение `OFQM7`; `Notification Toast / Master` `yYFpn`) и смонтировать `NotificationsStream` и `NotificationToaster` в `layouts/AppShell.tsx`; переход — `NkBIs`, «Задача не найдена» — `Auh6k`.
- [x] 20.6 Прогнать тесты из 20.1 и весь `npm test` control-center и зафиксировать, что они зелёные (green). `npm run typecheck` зелёный.
- [x] 20.7 Проверить UI по `.claude/rules/frontend-ui-verification.md` через `electron-stagewright`:
  - колокольчик, поповер (все состояния), тост, клик → раздел «Задачи» с открытой задачей, «Прочитать все»;
  - живое уведомление при создании задачи на этого пользователя с другого аккаунта;
  - скриншоты сверить с фреймами из 20.3–20.5, консоль без ошибок.

## 21. manager-helper: сигнал начала сессии и общие модули

- [x] 21.1 Добавить `socket.io-client` в `manager-helper`. Проверка: `npm install` и `npm run typecheck` зелёные.
- [x] 21.2 Написать тесты:
  - `shared/auth/session-channel.test.ts`: `startSession` рассылает `session-started` во все контексты, `onSessionStarted` подписывает и отписывает; login и смена пароля в `auth-service` вызывают `startSession`;
  - `shared/notifications/*.test.ts`:
    - `notifications-api` через `authFetch`;
    - zod-схемы событий и DTO;
    - `panel-protocol` (guards сообщений порта);
    - `pending-target` (`set`/`take` в `chrome.storage.session`, `take` очищает);
    - `format-badge-count` (пусто при 0, `99+`).
- [x] 21.3 Прогнать тесты из 21.2 и зафиксировать, что они падают (red).
- [x] 21.4 Реализовать `startSession`/`onSessionStarted` (с вызовами из `auth-service`), `shared/notifications/notifications-api.ts`, `notifications-schema.ts`, `panel-protocol.ts`, `pending-target.ts`, `format-badge-count.ts`.
- [x] 21.5 Прогнать тесты из 21.2 и все тесты `shared/auth` и зафиксировать, что они зелёные (green).

## 22. manager-helper: фоновый процесс уведомлений

- [x] 22.1 Написать тесты `background/notifications/*.test.ts` с моками `chrome.*` и socket.io-client:
  - `notifications-socket`: только транспорт `websocket`, `auth` из `refreshAccessToken`/текущего токена, переподключение после `auth_expired`;
  - `missed-notifications`: 0 → ничего, 1–3 → по одному, больше 3 → сводное «У вас N новых уведомлений», `lastSeenCreatedAt` сдвигается, уже показанные не повторяются;
  - `system-notifier`: `chrome.notifications.create` с `id` уведомления, без показа при подключённой панели; клик → `POST read`, цель в `pending-target`, `chrome.sidePanel.open({ windowId })`, при отказе — фокус окна; клик по сводному → цель «список уведомлений»;
  - `unread-badge`: текст бейджа по `unreadCount`, очистка при выходе;
  - `panel-port-hub`: учёт открытых портов, пересылка событий и состояния;
  - `connection-watchdog`: `chrome.alarms` раз в минуту переподключает, если залогинен и сокета нет;
  - `startBackgroundNotifications`:
    - подключение на `onStartup`, `onInstalled` и `session-started` при восстановленной сессии;
    - на `session-ended` — разрыв, очистка бейджа и закрытие показанных уведомлений.
- [x] 22.2 Прогнать тесты из 22.1 и зафиксировать, что они падают (red).
- [x] 22.3 Реализовать модули `background/notifications/*` и вызов `startBackgroundNotifications()` в `background/index.ts`. В `manifest.config.ts`: `permissions += notifications, alarms`, `minimum_chrome_version: '116'`.
- [x] 22.4 Прогнать тесты из 22.1 и зафиксировать, что они зелёные (green), регрессий нет.

## 23. manager-helper: модель уведомлений в панели

- [x] 23.1 Написать тесты `sidepanel/notifications/*.test.tsx`:
  - `useBackgroundPort`: подключение порта `notifications`, переподключение при разрыве, приём событий и состояния;
  - `useNotifications`: загрузка через REST, применение событий порта с дедупликацией по `id`, `markRead`/`markAllRead`, перезагрузка при `online`, `isInitialLoad`/`isRefreshing`, тост для нового уведомления;
  - `usePendingTarget`: при монтировании забирает цель и вызывает переход, реагирует на изменение цели;
  - `TasksApp`/`TasksSplitView`: `requestedTaskId` открывает детали задачи.
- [x] 23.2 Прогнать тесты из 23.1 и зафиксировать, что они падают (red).
- [x] 23.3 Реализовать `useBackgroundPort`, `useNotifications`, `usePendingTarget` и проп `requestedTaskId` в `TasksApp`/`TasksSplitView`.
- [x] 23.4 Прогнать тесты из 23.1 и зафиксировать, что они зелёные (green).

## 24. manager-helper: UI уведомлений (по ui-design.md)

- [x] 24.1 Написать тесты компонентов:
  - `NotificationsButton` (счётчик, `99+`, без счётчика при 0);
  - `NotificationsOverlay` (список, бейдж «N новых» из пропа `unreadCount`, загрузка, пусто, ошибка, подгрузка и её ошибка, «Прочитать все» неактивна при 0, закрытие; узкая раскладка и выпадающий список при ширине ≥ брейкпоинта `TasksSplitView`);
  - форматтер относительного времени: короткий режим («2 мин», «1 ч»);
  - `NotificationItem`;
  - `NotificationToast`;
  - `PanelHeader` со слотом `notifications`;
  - `App`: клик по уведомлению переключает на «Задачи» с открытой задачей, для удалённой задачи показывает «Задача не найдена».
- [x] 24.2 Прогнать тесты из 24.1 и зафиксировать, что они падают (red).
- [x] 24.3 Сверстать кнопку уведомлений в `PanelHeader` (новый слот `notifications`) по фрейму `B5t6NG` (без счётчика `Jo5VH`, 3 `YacY1`, 99+ `phRRF`, список открыт `nOUv0`; `ekWsX`) (design/synergy-design-kit.pen, читать через `mcp__pencil__execute`/Get).
- [ ] 24.4 Сверстать `NotificationsOverlay` и `NotificationItem` по фрейму `E2vBTN` (список `G52zs`, загрузка `OH9Ku`, пусто `Ydcje`, ошибка `g5D1OF`, подгрузка `XCxqJ`; планшет 860 px — `I6dze`; строка `MaZJj`) и сверить со скриншотом.
- [x] 24.5 Сверстать `NotificationToast` по фрейму `ACXNU` (`yYFpn`) и подключить уведомления в `sidepanel/App.tsx`; детали задачи после клика — `vZhDc`, «Задача не найдена» — `LA1Op`. Системные уведомления и бейдж сверять с мокапами `iautc` (`z1MkjO`, `E36w9`, `aAxZU`, `mkmjh`).
- [x] 24.6 Прогнать тесты из 24.1 и весь `npm test` manager-helper и зафиксировать, что они зелёные (green). `npm run typecheck` и `npm run lint` без ошибок.
- [x] 24.7 Проверить UI по `.claude/rules/frontend-ui-verification.md` через MCP `extension` (окно 400×800, после `npx vite build`):
  - кнопка и оверлей во всех состояниях, тост в открытой панели, клик → «Задачи» с деталями;
  - при закрытой панели — системное уведомление и бейдж;
  - клик по системному уведомлению открывает панель на задаче;
  - сводное уведомление после перезапуска с пропущенными;
  - скриншоты сверить с фреймами из 24.3–24.5, консоль без ошибок.

## 25. Сквозная проверка

- [x] 25.1 Поднять бэкенд с инфраструктурой. Залогиниться одним пользователем в control-center и manager-helper одновременно, другим пользователем создать задачу на первого. Проверить:
  - уведомление пришло в оба интерфейса;
  - прочтение в одном снимает счётчик в другом;
  - после перезапуска бэкенда клиенты переподключились сами.
  Результат зафиксировать коротко в описании PR.
- [x] 25.2 Прогнать `npm test`, `npm run typecheck`, `npm run lint` во всех трёх пакетах (`backend`, `control-center`, `manager-helper`) и зафиксировать, что всё зелёное. Выполнить `openspec validate add-realtime-notifications --strict`.

## 26. Code review

- [x] 26.1 Запустить code-review (скилл `code-review`) по всем изменениям фичи — от коммита, с которого начат change, до текущего HEAD: соответствие стандартам проекта и specs этого change
- [x] 26.2 Исправить замечания ревью (блокирующие и существенные обязательно; остальные — исправить или явно отклонить с обоснованием), результат зафиксировать коммитом
- [x] 26.3 Повторить code-review по правкам из 26.2 и убедиться, что блокирующих замечаний нет; прогнать тесты и зафиксировать, что они зелёные
