## Context

Мотивация описана в proposal.md (раздел Why), требования — в specs. Ниже только то, что определяет подход.

- **Backend:** NestJS 12, Postgres через Slonik (сырой SQL), Redis через `ioredis`, конфиг через `@nestjs/config` с zod-схемой (`shared/config/env.schema.ts`). Модули устроены по слоям `domain / application / infrastructure / interface/http`, порты оформлены абстрактными классами и служат DI-токенами. Глобальный `JwtAuthGuard` пропускает только запросы с Bearer-токеном. `@Public()` снимает эту проверку.
- **Telegram в коде уже есть, но не используется:** `audit-agent/infrastructure/telegram/notifier.adapter.ts` отправляет `sendMessage` через `fetch` и делит ошибки на `TransientNotifyError` (сеть, 429, 5xx) и `PermanentNotifyError` (400/401/403). Приёма обновлений нет, сопоставления чатов с пользователями нет. Из переменных есть только `TELEGRAM_BOT_TOKEN`, и она необязательная.
- **Пользователи:** `auth_users` (`id`, `login`, `isActive`, …), своих JWT выдаёт `auth`. Внешних идентичностей нет.
- **Уведомления реализованы** (`add-realtime-notifications`, в архиве, specs в `openspec/specs/notifications*` и `domain-event-outbox`):
  - модуль `notifications` с портом `NotificationChannelPort { channel; deliver(notification, unreadCount) }` (multi-provider); для каждого канала автоматически регистрируется подписчик outbox `notifications.channel.<channel>`;
  - outbox: у каждой пары «событие + подписчик» своя строка доставки и свои ретраи по `RetryPolicy`; после лимита попыток — `failed`;
  - результат доставки записывается, только если совпадает токен аренды (`claim_token`); обработчик ограничен таймаутом `OutboxSettings.handlerTimeoutMs` (60 с, константа `DEFAULT_HANDLER_TIMEOUT_MS`, короче 5-минутной аренды); при таймауте доставка уходит в ретрай, и повтор может начаться, пока первый вызов ещё не закончился;
  - экземпляр забирает доставки только тех подписчиков, которые у него зарегистрированы; удаление или переименование подписчика требует миграции, которая помечает его оставшиеся строки `failed`;
  - немедленного `failed` по решению подписчика и паузы, заданной подписчиком, нет — это расширение делает данное изменение (решение 7).
- **Клиенты:**
  - control-center ходит в API через прокси `cc-api://backend` со списком разрешённых префиксов `ALLOWED_PREFIXES`. Внешние ссылки (`target=_blank`) main открывает в системе через `setWindowOpenHandler` + `isSafeExternalUrl`.
  - manager-helper ходит через `authFetch`, настройки открываются кнопкой в `PanelHeader`.
- **Правила проекта** (`.claude/rules/code-style.md`) важнее существующего кода:
  - порт называется с суффиксом `Port`, адаптер — по роли, без названия технологии (`TelegramNotifier` прямо запрещён);
  - без `as` и `any`, внешние данные валидируются zod на границе;
  - операции над несколькими таблицами идут в транзакции;
  - ключи Redis строятся по схеме `<service>:<entity>:<id>` и всегда с TTL;
  - токены и персональные данные не логируются.

## Goals / Non-Goals

**Goals:**
- Надёжная связь «Telegram-пользователь ↔ пользователь системы»: ею потом воспользуются будущие сценарии (агент, постановка задач) без переделки привязки.
- Бот принимает обновления одинаково в проде (webhook) и локально (polling), без публичного адреса у разработчика.
- Канал `telegram` подключается к `notifications` как обычный адаптер: ядро уведомлений и правила не меняются.
- Повторная или параллельная обработка обновлений и уведомлений не порождает дублей в чате. Единственный допустимый дубль — если процесс упал между успешной отправкой и её фиксацией (гарантия «хотя бы один раз»).

**Non-Goals:**
- Свободный текст, диалоги и вызов агента из бота. Сейчас на это есть только точка расширения (решение 5).
- Отдельный порядок уведомлений в Telegram. Порядок тот же, что даёт outbox (в пределах агрегата).
- Объединение с `audit-agent/infrastructure/telegram`. Он остаётся как есть, сведение двух клиентов — отдельная задача.
- Несколько ботов или окружений на одном боте. Один бот на окружение, у каждого окружения свой токен.

## Decisions

### 1. Отдельный модуль `telegram`, а не часть `auth` или `notifications`

`modules/telegram` владеет привязкой, приёмом обновлений, командами и каналом доставки.
- `auth` о Telegram ничего не знает. Модуль читает логин и активность пользователя через свой порт `UserDirectoryPort`, адаптер которого обращается к публичному контракту `auth` — `FindActiveUserUseCase`, экспортируемому из `AuthModule`. Таблицу `auth_users` модуль напрямую не читает.
- `notifications` о Telegram тоже не знает. Модуль регистрирует свой адаптер под multi-provider токеном каналов.

*Альтернативы:*
- Привязка внутри `auth` как «внешняя идентичность». Отклонена: `auth` стал бы зависеть от Bot API и webhook. Вход через Telegram мы не делаем, поэтому общей логики с аутентификацией нет.
- Привязка внутри `notifications`. Отклонена: привязка понадобится и без уведомлений (агент в боте), и тогда уведомления стали бы владельцем идентичности.

### 2. Одноразовый токен привязки в Redis

- **Выпуск.** `crypto.randomBytes(24)` → base64url, 32 символа, 192 бита. Это укладывается в ограничения параметра `start` (до 64 символов `[A-Za-z0-9_-]`).
- **Хранение.** Под ключом `telegram:link-token:<sha256(token)>` лежит значение `userId`, `EX = TELEGRAM_LINK_TOKEN_TTL_SECONDS` (по умолчанию 600). В Redis попадает только хеш, поэтому дамп Redis не даёт рабочих ссылок.
- **Погашение.** Атомарный `GETDEL`: два параллельных `/start` с одним токеном не привяжут два аккаунта. Токен гасится до любых проверок, так что неудачная попытка (аккаунт занят другим пользователем, пользователь отключён) тоже его сжигает. Это отвечает требованию спеки.
- **Несколько ссылок.** Токены одного пользователя не отзывают друг друга: каждая ссылка независима и короткоживуща (спека «Несколько ссылок подряд»).

*Альтернатива:* таблица `telegram_link_tokens` в Postgres. Отклонена: TTL и атомарное погашение в Redis бесплатны, а в Postgres пришлось бы чистить таблицу по расписанию. Потеря Redis означает лишь, что пользователь выпустит ссылку заново.

### 3. Модель данных и агрегат `TelegramLink`

Миграция `018_telegram.sql` (после `016_outbox.sql` и `017_notifications.sql` из `add-realtime-notifications`).

**`telegram_links`:**
- `user_id uuid primary key references auth_users(id) on delete cascade`;
- `telegram_user_id bigint not null unique`;
- `chat_id bigint not null`;
- `username text null`;
- `notifications_enabled boolean not null default true`;
- `linked_at timestamptz not null`;
- `updated_at timestamptz not null`.

Первичный ключ по `user_id` и `unique(telegram_user_id)` обеспечивают «один к одному» на уровне БД, даже если проверку в коде обойдёт гонка.

**`telegram_deliveries`:** `notification_id uuid primary key`, `user_id uuid not null`, `status text not null` (`sending | sent | skipped`), `reserved_at timestamptz not null`, `message_id bigint null`, `sent_at timestamptz null`. Это журнал отправки для идемпотентности канала: строка `sending` — бронь на время отправки, `sent` — факт отправки, `skipped` — уведомление сознательно не отправлено (решение 7). Очищается вместе с уведомлениями. Сейчас уведомления не чистятся (Non-Goal `add-realtime-notifications`), поэтому и журнал не чистится.

**Агрегат `TelegramLink`:**
- `link(userId, identity, now)` создаёт агрегат;
- `relink(identity, now)` обновляет `chatId` и `username` того же Telegram-пользователя и сохраняет `notificationsEnabled`;
- `enableNotifications()` и `disableNotifications()` переключают уведомления.

Идентичность — VO `TelegramIdentity { telegramUserId, chatId, username }`.

**Use-case привязки** `LinkAccountUseCase` целиком выполняется в одной транзакции (`TransactionRunner`):
1. `GETDEL` токена. Если токена нет — `InvalidLinkToken`.
2. `users.findActiveById(userId)`. Если пользователя нет или он отключён — `InvalidLinkToken`.
3. `links.findByTelegramUserId(tgId)`. Если привязка принадлежит другому пользователю — `TelegramAccountTaken`.
4. `links.findByUserId(userId)`:
   - есть привязка к другому `tgId` — удалить её и запомнить прежний `chatId`, чтобы отправить туда сообщение об отвязке;
   - есть привязка к тому же `tgId` — `relink`;
   - привязки нет — `link`.
5. Сохранить привязку.

Сообщения в чат отправляются после commit. Если отправка не удалась, привязка не откатывается: это только подтверждение. Нарушение уникальности из-за гонки двух ссылок разных пользователей на один `tgId` превращается в `TelegramAccountTaken`.

### 4. Приём обновлений: webhook в проде, polling локально, один разборщик

`TELEGRAM_UPDATES_MODE`:
- **`webhook`.** При старте `TelegramUpdatesBootstrap` вызывает `setWebhook(url, secret_token, allowed_updates=["message"])`. Вызов идемпотентен, поэтому безопасен при нескольких экземплярах. Контроллер `POST /telegram/webhook` помечен `@Public()`. Он сверяет `X-Telegram-Bot-Api-Secret-Token` с `TELEGRAM_WEBHOOK_SECRET` сравнением за постоянное время. При несовпадении отвечает 401. Если секрет верный, передаёт update диспетчеру и отвечает 200.
  - Обработка выполняется синхронно в запросе: все действия бота — это короткие запросы к БД, Redis и `sendMessage`.
  - Ошибка обработки логируется, но всё равно даёт 200. Иначе Telegram будет бесконечно повторять «ядовитое» обновление и задержит остальные.
- **`polling`.** `TelegramUpdatesPoller` вызывает `deleteWebhook`, затем `getUpdates(offset, timeout=25)` в цикле. Его ведёт только экземпляр, удерживающий Redis-lock `telegram:poller:lock` (`SET NX PX 60000` с продлением каждые 20 с). Остальные экземпляры периодически пытаются взять lock. Telegram подтверждает обработанные обновления через `offset`, поэтому хранить offset у нас не нужно.
- **`off`.** Обновления не принимаются. Эндпоинты привязки при этом работают, но привязать аккаунт будет нечем. Режим нужен для тестов и окружений без бота.

**Дедупликация.** Перед обработкой выполняется `SET telegram:update:<update_id> 1 NX EX 86400`. Если ключ уже есть, update пропускается. Это закрывает повторы webhook и переключение лидера polling.

**Разбор.** Update валидируется zod-схемой (`message.chat.type`, `message.from.id`, `message.text`). Всё, что не подходит (не `private`, нет `from`, нет текста), молча игнорируется.

*Альтернативы:*
- Только webhook. Отклонено: разработчику понадобился бы туннель.
- Только polling. Отклонено: при нескольких экземплярах и выкатке появляются окна, когда лидера нет, а webhook такой задержки не даёт.
- Библиотека grammY или telegraf. Отклонено: нужны четыре метода (`sendMessage`, `setWebhook`, `deleteWebhook`, `getUpdates`). Свой тонкий клиент на `fetch` с zod-валидацией ответов соответствует запрету `as`/`any` и уже существующему коду. К библиотеке можно вернуться, когда появятся диалоги и inline-клавиатуры, порт при этом не изменится.

### 5. Диспетчер команд и точка расширения для свободного текста

`BotUpdateDispatcher` (application):
1. Распознаёт отправителя через `IdentityResolver`: привязка по `telegram_user_id` плюс `users.findActiveById`. Если привязки нет или пользователь отключён, отправитель — `anonymous`.
2. Разбирает команду: первое слово, начинающееся с `/`, с учётом формы `/cmd@BotName`.
3. Направляет команду обработчику:
   - для `anonymous`: `/start <token>` → `LinkAccountUseCase`, всё остальное → инструкция по привязке;
   - для привязанного: `/start` без токена и `/help` → справка, `/unlink` → `UnlinkAccountUseCase`, `/mute` и `/unmute` → `SetTelegramNotificationsUseCase`;
   - не команда → `FreeTextHandlerPort.handle(userId, text)`. Сейчас это `NotSupportedFreeTextHandler` с ответом «пока не поддерживается» и списком команд. Будущее изменение «агент в Telegram» заменит этот адаптер, и ни привязка, ни диспетчер не изменятся.

Тексты ответов лежат в одном файле констант application-слоя на русском, отправляются с `parse_mode: HTML`, пользовательские данные экранируются (`& < >`).

`/start <token>` от уже привязанного отправителя тоже идёт в `LinkAccountUseCase`. Так работают «повторная привязка того же аккаунта» и «смена пользователя на этом Telegram»: последняя упрётся в `TelegramAccountTaken`.

### 6. REST API для пользователя

Все эндпоинты требуют access-токен и работают только с привязкой текущего пользователя:
- `GET /telegram/link` → `{ isAvailable, isLinked, username?, notificationsEnabled?, linkedAt? }`. `isAvailable = false`, если бот не настроен (нет токена или имени бота, либо режим `off`).
- `POST /telegram/link-token` → 201 `{ url, expiresAt }`. Если бот не настроен — 503 `TELEGRAM_NOT_CONFIGURED`.
- `PATCH /telegram/link` `{ notificationsEnabled: boolean }` → 200 со статусом. Если привязки нет — 404 `TELEGRAM_NOT_LINKED`.
- `DELETE /telegram/link` → 204, идемпотентно.

Ограничение частоты для `POST /telegram/link-token` — 10 в минуту на пользователя, по схеме throttling из `auth`. Это защищает от засорения Redis и от перебора.

### 7. Канал доставки `telegram`

Адаптер `MessengerChannel` (`infrastructure/telegram/messenger.channel.ts`) реализует `NotificationChannelPort`, где `channel = 'telegram'`. Регистрируется в multi-provider каналов. Для него автоматически появляется отдельный подписчик outbox `notifications.channel.telegram`.

`deliver(notification)`:
1. **Бронь.** Одним запросом `INSERT … status = 'sending', reserved_at = now ON CONFLICT (notification_id) DO UPDATE SET reserved_at = now WHERE telegram_deliveries.status = 'sending' AND reserved_at < now - TELEGRAM_DELIVERY_RESERVATION_MS RETURNING`. Бронь живёт 120 с — дольше таймаута обработчика outbox (60 с).
   - строка вернулась — бронь наша, идём дальше;
   - не вернулась, статус `sent` или `skipped` — уже обработано, канал сразу возвращает успех;
   - не вернулась, статус `sending` и бронь свежая — уведомление прямо сейчас отправляет другой вызов (например, повтор после таймаута), канал бросает `ChannelDeliveryInProgressError` (наследник `RetryLaterDeliveryError` из `notifications/domain`) до истечения брони; `ChannelDeliverySubscriber` не считает его сбоем канала в метрике.
2. Загрузить привязку и активность получателя. Если привязки нет, уведомления выключены или пользователь отключён — `status = 'skipped'`, успех без отправки.
3. Отправить `sendMessage(chatId, "<b>{title}</b>\n{body}", HTML)` с таймаутом запроса 10 с (короче таймаута обработчика outbox).
4. Записать `status = 'sent'`, `message_id`, `sent_at`.

При ошибке отправки (шаг 3) бронь снимается (строка удаляется), и ошибка пробрасывается дальше по классификации ниже. Ошибка записи на шаге 4 бронь не снимает и не считается ошибкой отправки: она пробрасывается как есть, и повторы до истечения брони получают `ChannelDeliveryInProgressError`. Если процесс упал между шагами 3 и 4 или запись шага 4 не удалась, бронь протухнет через 120 с и повтор отправит сообщение ещё раз — это единственный путь к дублю, он принят (см. Risks).

**Канал работает вне транзакции outbox.** Подписчик `ChannelDeliverySubscriber` объявляет `isTransactional = false`, поэтому relay вызывает его без своей транзакции, а `done` пишет отдельным запросом. Бронь, `sent`, `skipped` и снятие брони коммитятся каждым запросом сразу:
- параллельный повтор (например, после таймаута обработчика) сразу видит свежую бронь и получает `RetryLaterDeliveryError`, а не ждёт чужую незакоммиченную строку;
- если после успешной отправки relay потерял аренду (`markDone` вернул `false`), запись `sent` не откатывается, и следующий повтор завершается успехом без второго сообщения;
- `sendMessage` не держит соединение пула и блокировку строки `telegram_deliveries` на время HTTP-запроса.

`TelegramDeliveryLog` внутри открытой транзакции бросает `DeliveryLogInsideTransactionError`: slonik не даёт выполнять запросы пула внутри чужой транзакции, а запись через соединение транзакции снова сделала бы бронь невидимой до commit. Остальные каналы (`realtime`) тоже вызываются вне транзакции: они ничего не пишут в БД.

**Бот не настроен.** Если токена бота нет, уведомление получает окончательный `skipped`, как при отсутствии привязки. После настройки токена ранее созданные уведомления не досылаются: это та же семантика, что в сценарии «Пропуск без привязки».

Ошибки Bot API классифицирует `BotApiClient` (по образцу существующего `NotifierAdapter`):
- сеть, 5xx — `TransientDeliveryError`, ретрай по `RetryPolicy`;
- 429 с `parameters.retry_after` — `RetryLaterDeliveryError(retryAfterMs)`;
- 403 «blocked by the user», «user is deactivated», 400 «chat not found» — канал удаляет привязку пользователя к этому `chat_id` (`deleteByUserIdAndChatId`; привязку к другому чату, сделанную за время отправки, не трогает) и возвращает успех (спека «Заблокированный бот»);
- прочие 400 и 401 — `PermanentDeliveryError`, сразу `failed`. 401 означает неверный токен бота: это лог уровня `error` (его пишет relay outbox при переводе в `failed`, канал не логирует повторно), ретраи бессмысленны.

**Требуемое расширение outbox** (`shared/outbox` из `add-realtime-notifications`). Relay должен понимать два вида ошибок подписчика:
- `PermanentDeliveryError` — сразу `failed`, без ретраев;
- ошибка с `retryAfterMs` — `next_attempt_at = max(RetryPolicy.nextAttemptAt, now + retryAfterMs)`.

- подписчик может объявить `isTransactional = false` — тогда relay вызывает его вне своей транзакции и пишет `done` отдельно; при потере аренды результат подписчика не откатывается, поэтому такой подписчик сам отвечает за идемпотентность.

Это обратно совместимое расширение контракта подписчика: остальные ошибки и подписчики без флага обрабатываются как раньше. В `add-realtime-notifications` его нет, поэтому оно делается в этом изменении отдельной группой задач в `shared/outbox` и оформлено дельтой spec `domain-event-outbox`. Классы ошибок лежат в `shared/outbox/domain`, чтобы подписчики любых модулей зависели только от контракта, а не от relay.

*Альтернатива:* канал сам подписывается на доменные события задач. Отклонена (решение пользователя): это дублировало бы правила уведомлений, а тексты в приложении и в Telegram разошлись бы.

### 8. Клиенты

- **control-center.** Доступ к API устроен как у задач: `lib/backend/telegram.api.ts`, `telegram.schema.ts` (zod), `telegram.queries.ts` (`queryOptions` и мутации TanStack Query). UI лежит в `features/telegram/`. Пункт меню добавляется в `AccountMenu`, раздел открывается диалогом.
  - Ссылка открывается через `<a target="_blank">` или `window.open`. Main уже передаёт такие ссылки системе через `setWindowOpenHandler`, а `isSafeExternalUrl` пропускает любой `https:`, поэтому main менять не нужно.
  - В `ALLOWED_PREFIXES` добавляется `/telegram`.
  - Ожидание привязки реализовано как `refetchInterval: 2000` у запроса статуса, пока диалог в состоянии ожидания и `now < expiresAt`.
- **manager-helper.** Кнопка настроек в `PanelHeader` уже открывает страницу options (`chrome.runtime.openOptionsPage()`), поэтому раздел `options/telegram/TelegramSection.tsx` встаёт туда, а не в side panel. Страница options — полноценная вкладка, на ней удобнее ждать привязку.
  - `src/shared/telegram-api.ts` использует `authFetch`.
  - Ссылка открывается через `chrome.tabs.create({ url })`.
  - Ожидание — интервал 2 с, пока раздел смонтирован и ссылка не истекла.
  - Подтверждение отвязки делается собственным компонентом, без `confirm()`.

Детали экранов будут в ui-design.

### 9. Конфигурация

В `env.schema.ts` добавляются переменные (все описываются в `.env.example`):
- `TELEGRAM_BOT_TOKEN` (уже есть);
- `TELEGRAM_BOT_USERNAME` — для построения `t.me/<bot>`;
- `TELEGRAM_UPDATES_MODE` (`webhook | polling | off`, по умолчанию `off`);
- `TELEGRAM_WEBHOOK_URL` и `TELEGRAM_WEBHOOK_SECRET` — обязательны при `webhook`, секрет от 32 символов, проверяется через zod `superRefine`;
- `TELEGRAM_LINK_TOKEN_TTL_SECONDS` (по умолчанию 600);
- `TELEGRAM_API_BASE_URL` (по умолчанию `https://api.telegram.org`) — адрес Bot API; в e2e-тестах и локальной проверке без настоящего бота на него ставится локальная заглушка;
- `TELEGRAM_DELIVERY_RESERVATION_MS` (по умолчанию 120000, MUST быть больше `OutboxSettings.handlerTimeoutMs`; проверяется при старте).

Значения читаются через адаптер `TelegramSettings`, который реализует `TelegramSettingsPort`. Токен бота не логируется и не попадает в тексты ошибок: для этого есть тест, как в `notifier.adapter`.

### 10. Логирование и метрики

По `.claude/rules/logging.md`:
- `log` — привязка и отвязка (`userId`, без `chat_id`, username и текста);
- `warn` — неверный секрет webhook, 429;
- `error` — `PermanentDeliveryError`, 401 Bot API, сбой обработки update (`update_id`, тип ошибки).

Метрики: `telegram_updates_total{result}`, `telegram_messages_sent_total{kind}`, `telegram_send_errors_total{reason}`.

## Risks / Trade-offs

- **[Риск] Выкатка по экземплярам.** Подписчик `notifications.channel.telegram` обрабатывают только экземпляры, где он зарегистрирован. → Пока часть экземпляров на старой версии, доставки в Telegram ждут обновлённых, но не теряются. При удалении или переименовании канала нужна миграция, помечающая его строки `failed`.
- **[Риск] Процесс падает между `sendMessage` и записью `sent`, и после истечения брони придёт дубль.** → Окно — миллисекунды. Это осознанная цена гарантии «хотя бы один раз»: «ровно один раз» с внешним API недостижимо. Параллельный повтор после таймаута обработчика дубля не даёт — его останавливает бронь.
- **[Риск] Ссылку переслали другому человеку, и он привязал свой Telegram к чужой учётной записи.** → TTL 10 минут, одноразовость. Бот сообщает логин учётной записи после привязки, приложение показывает username привязанного аккаунта, отвязать можно в один клик. Подтверждение привязки в приложении не делаем: это лишние шаги при низком риске во внутренней системе.
- **[Риск] Секрет webhook утёк, и кто-то шлёт поддельные update.** → Подделать можно только сообщения «от имени» известного `telegram_user_id`. Сейчас это даёт лишь `/unlink`, `/mute` и `/unmute`. Перед появлением агента в боте нужно пересмотреть защиту (ротация секрета, allowlist IP Telegram).
- **[Компромисс] Синхронная обработка в webhook.** → Просто и достаточно для текущих команд. Когда появится агент (долгие ответы), обработку свободного текста нужно будет вынести в очередь, иначе Telegram получит таймаут.
- **[Компромисс] Запрос статуса раз в 2 с во время ожидания вместо push.** → Ожидание короткое и ограничено сроком ссылки. WebSocket из `add-realtime-notifications` уже есть, и событие `telegram.linked` можно добавить позже без изменения контракта REST; в этом изменении не делаем, чтобы не расширять протокол уведомлений.
- **[Риск] Lock poller'а теряется при паузе процесса, и в `getUpdates` одновременно ходят двое.** → Telegram вернёт второму 409 Conflict, poller уйдёт в ожидание lock, а дедупликация по `update_id` защитит от двойной обработки. Polling — режим разработки.

## Migration Plan

1. Выкатить миграцию `018_telegram.sql`.
2. Создать бота у BotFather для каждого окружения и задать `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_UPDATES_MODE=webhook`, `TELEGRAM_WEBHOOK_URL`, `TELEGRAM_WEBHOOK_SECRET`. Публичный адрес должен пропускать `POST /telegram/webhook`.
3. Выкатить бэкенд, затем клиенты. Пока режим `off`, клиенты прячут раздел (`isAvailable = false`), поэтому порядок выкатки безопасен.
4. **Откат.** `TELEGRAM_UPDATES_MODE=off` и `deleteWebhook`, канал `telegram` отключается флагом конфигурации. Таблицы остаются: привязки восстановятся при повторном включении.

## Open Questions

- Имя, аватар и описание бота в BotFather — организационный вопрос, на реализацию не влияет.
- Нужна ли в сообщении уведомления ссылка «Открыть в приложении». У control-center и manager-helper нет общего URL-адреса для перехода к задаче, поэтому сейчас ссылки нет. Её можно добавить без изменения спек канала.
