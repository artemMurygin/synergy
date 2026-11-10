# Architecture: add-telegram-account-linking

## Scope

**Backend:**
- новый модуль `telegram`: привязка по одноразовой ссылке, приём обновлений (webhook и polling), команды бота, REST для пользователя, канал доставки `telegram` для `notifications`;
- обратно совместимое расширение контракта подписчика в `shared/outbox`: немедленный `failed` и пауза, которую задаёт подписчик.

**Клиенты:**
- control-center: пункт «Telegram» в `AccountMenu` и диалог привязки;
- manager-helper: раздел «Telegram» на странице настроек (options).

> Шаблон ссылается на `frontend/CLAUDE.md` и FSD. В репозитории их нет. Клиенты устроены так:
> - control-center: `renderer/src/{features,lib/backend,stores,layouts,components/ui}`;
> - manager-helper: `src/{background,shared,sidepanel,options}`.
>
> Архитектура ниже следует фактической структуре. Для бэкенда приоритет у `.claude/rules/code-style.md`: порт называется с суффиксом `Port`, адаптер — по роли, без названия технологии. Технология видна по пути (`infrastructure/telegram/`, `infrastructure/persistence/`, `infrastructure/cache/`).

---

## Backend — Domain Model

### Entities

| Name | Status (new/existing) | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `TelegramLink` | new | да | `userId`, `identity: TelegramIdentity`, `notificationsEnabled`, `linkedAt`, `updatedAt` | Привязка Telegram-аккаунта к пользователю и настройка уведомлений |
| `TelegramDelivery` (запись) | new | — (модель инфраструктуры для идемпотентности канала) | `notificationId`, `userId`, `status: sending \| sent \| skipped`, `reservedAt`, `messageId \| null`, `sentAt \| null` | Бронь на время отправки и факт отправки уведомления в Telegram |
| `User` | existing (`auth`) | да (в `auth`) | `id`, `login`, `isActive` | Модуль `telegram` только читает его через `UserDirectoryPort` |
| `Notification` | external (`add-realtime-notifications`) | да (в `notifications`) | `id`, `recipientId`, `content` | Вход канала `telegram` |

### Aggregates

| Aggregate | Root entity | Входит в состав (entities/VO) | Инварианты, которые защищает |
|---|---|---|---|
| TelegramLink | `TelegramLink` | `TelegramIdentity` | `userId` и `identity.telegramUserId` не меняются после создания: смена Telegram-аккаунта означает новую привязку. `relink` принимает только identity с тем же `telegramUserId` и сохраняет `notificationsEnabled`. Новая привязка создаётся с `notificationsEnabled = true`. Уникальность «один к одному» дополнительно обеспечивают ограничения БД (PK `user_id`, `unique(telegram_user_id)`) |

### Value Objects

| Name | Поля | Почему VO (immutable/self-validating) |
|---|---|---|
| `TelegramIdentity` | `telegramUserId: bigint`, `chatId: bigint`, `username: string \| null` | Идентичность отправителя из обновления Telegram. Проверяет, что идентификаторы положительные, и нормализует username |
| `LinkToken` | `value: string`, `expiresAt: Date` | `generate(ttlSeconds, now)`: 24 случайных байта в base64url. `digest()`: sha256 для хранения. `deepLink(botUsername)`. Проверяет формат параметра `start` |
| `IncomingMessage` | `updateId`, `sender: TelegramIdentity`, `text` | Результат zod-разбора update. Создаётся только для личного чата с текстом |
| `BotCommand` | `name: 'start' \| 'help' \| 'unlink' \| 'mute' \| 'unmute'`, `argument: string \| null` | `parse(text, botUsername)`: понимает `/cmd`, `/cmd@BotName` и аргумент. Неизвестная команда даёт `null` |
| `BotSender` | `{ kind: 'anonymous' } \| { kind: 'linked'; userId; login; link: TelegramLink }` | Результат распознавания отправителя. Discriminated union, без `as` |
| `LinkResult` | `{ kind: 'linked'; login; previousChatId: bigint \| null }` | Результат привязки для ответа бота и уведомления прежнего чата |
| `TelegramLinkStatusView` | `isAvailable`, `isLinked`, `username?`, `notificationsEnabled?`, `linkedAt?` | Представление для REST без внутренних идентификаторов |

### Services

| Service | Слой (application/domain/infrastructure) | Ответственность |
|---|---|---|
| **Порты и адаптеры модуля `telegram`** | | |
| `TelegramLinkRepositoryPort` / `TelegramLinkRepository` | port: domain; adapter: `infrastructure/persistence` | Чтение и запись `telegram_links` через `executor()` текущей транзакции |
| `TelegramDeliveryLogPort` / `TelegramDeliveryLog` | port: domain; adapter: `infrastructure/persistence` | Журнал отправки `telegram_deliveries`: бронь, фиксация отправки, пропуск, снятие брони. Каждая запись коммитится сразу; внутри открытой транзакции адаптер бросает `DeliveryLogInsideTransactionError` (design, решение 7) |
| `LinkTokenStorePort` / `LinkTokenStore` | port: domain; adapter: `infrastructure/cache` (Redis) | `SET EX` по хешу токена, атомарное погашение через `GETDEL` |
| `UpdateDeduplicatorPort` / `UpdateDeduplicator` | port: application; adapter: `infrastructure/cache` (Redis) | `SET NX EX 86400` по `update_id` |
| `BotMessengerPort` / `BotMessenger` | port: application; adapter: `infrastructure/telegram` | Отправка сообщения в чат. Ошибки классифицированы (`TransientDeliveryError`, `RetryLaterDeliveryError`, `ChatUnavailableError`, `PermanentDeliveryError`) |
| `UserDirectoryPort` / `UserDirectory` | port: application; adapter: `infrastructure/users` (через публичный контракт `auth`: `FindActiveUserUseCase`, экспортируется из `AuthModule`) | `findActiveById(userId)` → `{ id, login }` или `null` |
| `TelegramSettingsPort` / `TelegramSettings` | port: application; adapter: `infrastructure/config` | Токен, имя бота, режим обновлений, webhook, TTL токена, `isConfigured()` |
| `FreeTextHandlerPort` / `NotSupportedFreeTextHandler` | port: application; adapter: application | Точка расширения для будущего агента. Сейчас отвечает «пока не поддерживается» |
| `ClockPort` / `Clock` | port: domain; adapter: infrastructure | Текущее время, для тестов |
| `TransactionRunnerPort` | existing (`database/postgres` после `add-realtime-notifications`) | Транзакция для привязки и отвязки, `afterCommit` для ответов бота |
| **Use-cases (application)** | | |
| `IssueLinkTokenUseCase` | application | Выпускает токен, сохраняет хеш, возвращает ссылку. Если бот не настроен — `TelegramNotConfiguredError` |
| `GetTelegramLinkStatusUseCase` | application | Статус привязки текущего пользователя |
| `LinkAccountUseCase` | application | Привязка по токену в одной транзакции (design, решение 3). Ответы в чат отправляются после commit |
| `UnlinkAccountUseCase` | application | Отвязка из приложения или бота, сообщение в прежний чат после commit. Идемпотентна |
| `SetTelegramNotificationsUseCase` | application | Включает и выключает уведомления. Без привязки — `TelegramNotLinkedError` |
| `BotUpdateDispatcher` | application | Дедупликация, разбор, распознавание отправителя, маршрутизация команд, перехват ошибок одного update |
| `IdentityResolver` | application | Строит `BotSender` по `TelegramIdentity`: привязка плюс активность пользователя |
| `BotReplies` | application | Тексты ответов на русском и HTML-экранирование |
| **Infrastructure / interface** | | |
| `BotApiClient` | `infrastructure/telegram` | Тонкий клиент Bot API на `fetch`: `sendMessage`, `setWebhook`, `deleteWebhook`, `getUpdates`. Ответы проходят zod-валидацию, токен не попадает в логи и ошибки |
| `TelegramUpdatesBootstrap` | `infrastructure/telegram` | На `onApplicationBootstrap` по режиму вызывает `setWebhook`, запускает poller или ничего не делает |
| `TelegramUpdatesPoller` | `infrastructure/telegram` | Цикл `getUpdates` под Redis-lock `telegram:poller:lock`, передаёт update в диспетчер |
| `MessengerChannel` | `infrastructure/telegram` | Адаптер `NotificationChannelPort`, где `channel = 'telegram'` (design, решение 7) |
| `TelegramWebhookController` | `interface/http` | `POST /telegram/webhook`, `@Public()`, проверка секрета за постоянное время, всегда 200 после проверки |
| `TelegramLinkController` | `interface/http` | `GET/PATCH/DELETE /telegram/link`, `POST /telegram/link-token`. Zod-схемы, Swagger, карта ошибок → HTTP |
| **shared/outbox (расширение)** | | |
| `PermanentDeliveryError`, `RetryLaterDeliveryError` | `shared/outbox/domain` | Контракт подписчика: немедленный `failed` и `next_attempt_at = max(policy, now + retryAfterMs)` |
| `OutboxRelay` | existing (`add-realtime-notifications`, меняется) | Понимает два новых вида ошибок, остальные обрабатывает как раньше. Запись результата по-прежнему защищена `claim_token` |

### Method Signatures (ключевые, по каждому сервису)

| Service.Method | Params | Returns | Краткое описание |
|---|---|---|---|
| `TelegramLink.link` (static) | `userId: string, identity: TelegramIdentity, now: Date` | `TelegramLink` | Новая привязка с включёнными уведомлениями |
| `TelegramLink.relink` | `identity: TelegramIdentity, now: Date` | `void` | Обновить `chatId`/`username`. Другой `telegramUserId` — `TelegramIdentityMismatchError` |
| `TelegramLink.enableNotifications` / `disableNotifications` | `now: Date` | `void` | Переключение, `updatedAt` |
| `LinkToken.generate` (static) | `ttlSeconds: number, now: Date` | `LinkToken` | Случайный токен и срок |
| `LinkToken.digest` | — | `string` | sha256 hex |
| `BotCommand.parse` (static) | `text: string, botUsername: string` | `BotCommand \| null` | Разбор команды |
| `TelegramLinkRepositoryPort.findByUserId` | `userId: string` | `Promise<TelegramLink \| null>` | — |
| `TelegramLinkRepositoryPort.findByTelegramUserId` | `telegramUserId: bigint` | `Promise<TelegramLink \| null>` | — |
| `TelegramLinkRepositoryPort.save` | `link: TelegramLink` | `Promise<void>` | Upsert по `user_id`. Нарушение `unique(telegram_user_id)` — `TelegramAccountTakenError` |
| `TelegramLinkRepositoryPort.deleteByUserId` | `userId: string` | `Promise<TelegramLink \| null>` | Возвращает удалённую привязку (для сообщения в прежний чат) |
| `TelegramDeliveryLogPort.reserve` | `{ notificationId, userId, now, reservationMs }` | `Promise<'reserved' \| 'done' \| { inProgressUntil: Date }>` | Один `INSERT … ON CONFLICT DO UPDATE … WHERE status = 'sending' AND reserved_at < now - reservation RETURNING` |
| `TelegramDeliveryLogPort.markSent` | `{ notificationId, messageId, sentAt }` | `Promise<void>` | `status = 'sent'` |
| `TelegramDeliveryLogPort.markSkipped` | `notificationId: string` | `Promise<void>` | Нет привязки, выключено или пользователь отключён |
| `TelegramDeliveryLogPort.release` | `notificationId: string` | `Promise<void>` | Снять бронь после ошибки отправки |
| `LinkTokenStorePort.save` | `digest: string, userId: string, ttlSeconds: number` | `Promise<void>` | Ключ `telegram:link-token:<digest>` |
| `LinkTokenStorePort.consume` | `digest: string` | `Promise<string \| null>` | `GETDEL` → `userId` |
| `UpdateDeduplicatorPort.markProcessed` | `updateId: number` | `Promise<boolean>` | `false`, если уже обработан |
| `BotMessengerPort.send` | `chatId: bigint, html: string` | `Promise<{ messageId: bigint }>` | Бросает классифицированные ошибки |
| `UserDirectoryPort.findActiveById` | `userId: string` | `Promise<{ id: string; login: string } \| null>` | `null`, если пользователя нет или он отключён |
| `FreeTextHandlerPort.handle` | `sender: LinkedSender, text: string` | `Promise<string>` | Текст ответа |
| `IssueLinkTokenUseCase.execute` | `actor: Actor` | `Promise<{ url: string; expiresAt: Date }>` | — |
| `GetTelegramLinkStatusUseCase.execute` | `actor: Actor` | `Promise<TelegramLinkStatusView>` | — |
| `LinkAccountUseCase.execute` | `{ token: string; identity: TelegramIdentity }` | `Promise<LinkResult>` | Ошибки `InvalidLinkTokenError`, `TelegramAccountTakenError` |
| `UnlinkAccountUseCase.execute` | `userId: string` | `Promise<void>` | Идемпотентна |
| `SetTelegramNotificationsUseCase.execute` | `userId: string, isEnabled: boolean` | `Promise<TelegramLinkStatusView>` | `TelegramNotLinkedError` |
| `BotUpdateDispatcher.dispatch` | `update: unknown` | `Promise<void>` | Никогда не бросает: ошибки логируются |
| `IdentityResolver.resolve` | `identity: TelegramIdentity` | `Promise<BotSender>` | — |
| `MessengerChannel.deliver` | `notification: Notification, unreadCount: number` | `Promise<void>` | Бронь → проверка привязки → `sendMessage` (таймаут 10 с) → `sent`. Вызывается вне транзакции relay (`ChannelDeliverySubscriber.isTransactional = false`). Свежая чужая бронь → `RetryLaterDeliveryError`. При заблокированном боте снимает привязку |
| `BotApiClient.sendMessage` / `setWebhook` / `deleteWebhook` / `getUpdates` | типизированные параметры метода | результат метода | Общий вызов `call` закрытый (private): классификация ошибок и проверка ответа zod |
| `FindActiveUserUseCase.execute` (`auth`) | `userId: string` | `Promise<{ id: string; login: string } \| null>` | Публичный контракт `auth` для других модулей |
| `EventSubscriber.isTransactional` (`shared/outbox`) | — | `boolean \| undefined` | `false` — relay вызывает подписчика вне своей транзакции и пишет `done` отдельно |
| `TelegramWebhookController.receive` | `secret: header, body: unknown` | `Promise<void>` (200) | 401 при неверном секрете |

**REST-контракт** (все `/telegram/link*` требуют access-токен):
- `GET /telegram/link` → `200 TelegramLinkStatusDto { isAvailable, isLinked, username?, notificationsEnabled?, linkedAt? }`;
- `POST /telegram/link-token` → `201 { url, expiresAt }` · `503 TELEGRAM_NOT_CONFIGURED` · `429` при превышении частоты;
- `PATCH /telegram/link` `{ notificationsEnabled: boolean }` → `200 TelegramLinkStatusDto` · `404 TELEGRAM_NOT_LINKED`;
- `DELETE /telegram/link` → `204`;
- `POST /telegram/webhook` (публичный) → `200` · `401`.

---

## Frontend — UI Model

### Pages

| Page | Route | Структура (ui / +model / +mediator) | Назначение |
|---|---|---|---|
| control-center: `AppShell` / `NavRail` (existing) | роутера нет | без изменений; в `AccountMenu` добавляется пункт | Точка входа |
| manager-helper: options `App` (existing, меняется) | `options/index.html` | ui + новый блок `TelegramSection` под настройками сервера и сессии | Раздел Telegram в настройках расширения |

### Features (переиспользуемые модули с бизнес-логикой)

| Feature | Статус (new/existing) | Публичный API (index.ts) | model/ (хуки, api.ts) | Назначение |
|---|---|---|---|---|
| control-center `lib/backend/telegram.*` | new | `telegram.api.ts`, `telegram.schema.ts`, `telegram.queries.ts` | `telegramLinkQuery`, `useIssueTelegramLinkToken`, `useSetTelegramNotifications`, `useUnlinkTelegram` | REST через `cc-api` и TanStack Query по образцу `tasks.queries` |
| control-center `features/telegram` | new | `TelegramMenuItem`, `TelegramDialog` | `use-telegram-link-flow.ts` (состояния `idle → issuing → waiting → linked / expired / error`, `refetchInterval` при ожидании) | UI подключения и управления |
| control-center `features/auth/AccountMenu` | existing (меняется) | — | — | Слот под `TelegramMenuItem` |
| control-center `main/cc-api-protocol` | existing (меняется) | — | `ALLOWED_PREFIXES += '/telegram'` | Прокси REST |
| manager-helper `shared/telegram-api.ts` + `shared/telegram-schema.ts` | new | `getTelegramLink`, `issueTelegramLinkToken`, `setTelegramNotifications`, `unlinkTelegram` | — | REST через `authFetch`, zod-схемы ответов |
| manager-helper `options/telegram` | new | `TelegramSection` | `use-telegram-link.ts` (тот же автомат состояний, `setInterval` 2 с при ожидании) | Раздел на странице настроек |

### UI-компоненты (page-local и shared)

| Component | Слой | Props (основные) | Назначение |
|---|---|---|---|
| `TelegramMenuItem` (cc) | `features/telegram`, в `AccountMenu` | `onOpen` | Пункт «Telegram» с подписью «Не подключён» или `@username`. Скрыт при `isAvailable = false` |
| `TelegramDialog` (cc) | `features/telegram`, на `components/ui/dialog` | `open`, `onOpenChange` | Контейнер: выбирает панель по состоянию |
| `TelegramConnectPanel` (cc) | `features/telegram` | `state`, `onConnect`, `onReopenLink`, `onCancel` | Кнопка «Подключить», ожидание, «Ссылка устарела», ошибка |
| `TelegramLinkedPanel` (cc) | `features/telegram` | `status`, `onToggleNotifications`, `onUnlink` | Username, время привязки, переключатель, «Отключить» с подтверждением |
| `TelegramSection` (mh) | `options/telegram` | — | Те же состояния в разметке страницы options |
| `InlineConfirm` (mh) | `options/telegram` | `message`, `onConfirm`, `onCancel` | Подтверждение отвязки без `confirm()` |

### Hooks (model)

| Hook | Расположение | Тип | Возвращает |
|---|---|---|---|
| `telegramLinkQuery(options?)` | cc `lib/backend/telegram.queries.ts` | `queryOptions` | `TelegramLinkStatus`. `refetchInterval` передаётся при ожидании |
| `useIssueTelegramLinkToken()` | cc `lib/backend/telegram.queries.ts` | mutation | `{ url, expiresAt }` |
| `useSetTelegramNotifications()` | cc `lib/backend/telegram.queries.ts` | mutation с оптимистичным обновлением и откатом | `TelegramLinkStatus` |
| `useUnlinkTelegram()` | cc `lib/backend/telegram.queries.ts` | mutation, инвалидирует `telegramLinkQuery` | `void` |
| `useTelegramLinkFlow()` | cc `features/telegram` | state-хук | `{ state, status, connect, reopenLink, cancel, toggleNotifications, unlink }` |
| `useTelegramLink()` | mh `options/telegram` | state-хук (`useState` + `useEffect`, без TanStack Query) | то же API, что у `useTelegramLinkFlow` |

### Паттерны, которые нужно учесть при проектировании

- [x] Публичный API фичи — только через `index.ts` (`features/telegram` в control-center).
- [x] Запросы к бэкенду — через query options factory в `lib/backend/telegram.queries.ts`. В manager-helper TanStack Query нет, там хук по образцу `use-tasks`.
- [x] Ошибки API нормализуются через существующий `lib/backend/errors.ts` (cc) и ошибки `authFetch` (mh). Коды `TELEGRAM_NOT_CONFIGURED`, `TELEGRAM_NOT_LINKED` дают отдельные состояния.
- [ ] `mediator/`-компонент — не нужен.
- [ ] Именованные слоты — не нужны.
- [x] `isInitialLoad` / `isRefreshing` — опрос статуса во время ожидания не должен показывать скелетон.
- [ ] `shared/ui-kit/` — в клиентах такого слоя нет: cc использует `components/ui` (shadcn: `dialog`, `switch`, `button`), mh — локальные компоненты страницы options.

---

## Diagrams

Доска общая с `add-realtime-notifications`, фреймы с префиксом «Telegram» стоят под фреймами того изменения.

### 1. Domain Entity Interaction
Агрегат `TelegramLink` с `TelegramIdentity`; `LinkToken`, `IncomingMessage`, `BotCommand`, `BotSender`; журнал `TelegramDelivery`; внешние `User` (auth) и `Notification` (notifications).

Miro link: https://miro.com/app/board/uXjVEP6UhAI=/?moveToWidget=3458764690029133570

### 2. External Modules Interaction
Telegram Bot API ↔ webhook и poller → диспетчер → use-cases → Postgres и Redis; `auth` (каталог пользователей); `shared/outbox` → `MessengerChannel` → `BotApiClient`; control-center (renderer → cc-api → REST, внешняя ссылка через main) и manager-helper (options → REST, `chrome.tabs`).

Miro link: https://miro.com/app/board/uXjVEP6UhAI=/?moveToWidget=3458764690029133571

### 3. Layer Interaction — от Controller до Response
Выпуск ссылки → `/start <token>` через webhook → `LinkAccountUseCase` в транзакции (ветки: недействительный токен, аккаунт занят, успех) → ответ бота → опрос статуса клиентом. Затем доставка уведомления через `MessengerChannel` с ветками «уже отправлено / нет привязки», 200, 403, 429/5xx, прочие 400/401.

Miro link: https://miro.com/app/board/uXjVEP6UhAI=/?moveToWidget=3458764690029133572

---

## Уточнения после ui-design

- **Имя бота:** в состоянии «Не подключён» текст без имени («в чат с ботом»); в ожидании имя бота берётся из `url` выпущенной ссылки. Контракт `GET /telegram/link` не меняется.
- **Обратный отсчёт** «Ссылка действует ещё m:ss» тикает раз в секунду от `expiresAt` отдельным таймером, независимо от опроса статуса раз в 2 с. Хуки `useTelegramLinkFlow` / `useTelegramLink` хранят `expiresAt` и отдают `remainingMs`.
- **Дополнительные состояния:** `issuing` (выпуск ссылки), `unlinking` («Отключаем…»), `TELEGRAM_NOT_CONFIGURED` в ответ на выпуск ссылки при открытом диалоге, скелетон загрузки статуса в mh. Пока статус не загружен, пункт меню в cc не показывается.
- **cc:** подтверждение отключения — отдельный диалог поверх `TelegramDialog` (по образцу `Confirm Delete Dialog`), кнопка «Готово» в подключённом состоянии. Новый компонент `components/ui/switch` (shadcn, Radix уже установлен).
- **mh:** время привязки показывается, в шапке раздела бейдж статуса.

## Уточнения после code review

- **Канал вне транзакции outbox.** Подписчики `notifications.channel.*` объявляют `isTransactional = false`: relay вызывает их без своей транзакции и пишет `done` отдельно. Журнал `telegram_deliveries` коммитит каждую запись сразу и отказывается работать внутри транзакции. Вызов Bot API не держит соединение пула и блокировку строки (design, решение 7).
- **Каталог пользователей** читается через `FindActiveUserUseCase` из `AuthModule`, а не SQL по `auth_users`.
- **Redis-клиент модуля** логирует ошибки через `PinoLogger` (`{ err }`, постоянное сообщение).

## Confirmation Checklist
- [x] Названия entity/aggregate/VO согласованы
- [x] Названия и сигнатуры ключевых методов сервисов согласованы
- [x] Слои (pages/features/kernel/shared), структура model/ui и паттерны фронта согласованы
- [x] Диаграммы взаимодействия отражают ожидаемую реализацию
- [x] Пользователь подтвердил переход к tasks.md
