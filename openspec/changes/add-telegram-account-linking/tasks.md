> Интеграционные тесты бэкенда запускаются с `PROGRAMS_ETL_TEST_ADMIN_URL=postgresql://audit:audit@127.0.0.1:5433/postgres` и `REDIS_PORT=6380` (контейнеры `docker compose up -d postgres redis` в `backend/`). Без этих переменных они пропускаются, и шаг red/green для них не считается пройденным.
>
> Настоящего бота локально нет (`TELEGRAM_BOT_TOKEN` пуст). Все тесты и автоматическая проверка ходят в локальную заглушку Bot API через `TELEGRAM_API_BASE_URL`. Проверка с настоящим Telegram — пункт 19.3, её выполняет пользователь после создания бота у BotFather.
>
> Node ID фреймов для UI-задач берутся из `ui-design.md` (`design/synergy-design-kit.pen`; читать через `mcp__pencil__*`, не Read/Grep). Разделы: control-center `05 · Telegram` (`CEjNm`), manager-helper `10 · Telegram` (`koxTO`), компоненты кита — `t3vxC`; сообщения бота (референс, «рендерит Telegram») — `VaZbB`.

## 1. Подготовка бэкенда

- [ ] 1.1 Написать тесты схемы env (`src/shared/config/env.schema.spec.ts`) и `TelegramSettings`:
  - значения по умолчанию: `TELEGRAM_UPDATES_MODE=off`, `TELEGRAM_LINK_TOKEN_TTL_SECONDS=600`, `TELEGRAM_DELIVERY_RESERVATION_MS=120000`, `TELEGRAM_API_BASE_URL=https://api.telegram.org`;
  - при `webhook` обязательны `TELEGRAM_WEBHOOK_URL` и `TELEGRAM_WEBHOOK_SECRET` от 32 символов (`superRefine`);
  - бронь меньше или равна `OutboxSettings.handlerTimeoutMs` — ошибка при старте;
  - `isConfigured()` ложен без токена, без имени бота или в режиме `off`;
  - токен бота не попадает в тексты ошибок и логи.
- [ ] 1.2 Прогнать тесты из 1.1 и зафиксировать, что они падают (red).
- [ ] 1.3 Добавить переменные в `env.schema.ts` и `.env.example`, реализовать `TelegramSettingsPort` и `TelegramSettings`.
- [ ] 1.4 Прогнать тесты из 1.1 и зафиксировать, что они зелёные (green).
- [ ] 1.5 Написать тест миграции `telegram-migration.spec.ts`:
  - таблица `telegram_links`: первичный ключ `user_id` с каскадом от `auth_users`, `unique(telegram_user_id)`;
  - таблица `telegram_deliveries`: `status` только `sending | sent | skipped`, `message_id` и `sent_at` допускают `null`.
- [ ] 1.6 Прогнать тест из 1.5 и зафиксировать, что он падает (red).
- [ ] 1.7 Написать `db/migrations/018_telegram.sql` по design.md, решение 3.
- [ ] 1.8 Прогнать тест из 1.5 и соседние тесты миграций и зафиксировать, что они зелёные (green).

## 2. Расширение outbox: решения подписчика

- [ ] 2.1 Написать тесты по дельте spec `domain-event-outbox` (`outbox-relay.spec.ts`, unit и интеграционные):
  - `PermanentDeliveryError` → сразу `failed` с текстом ошибки, метрика неудачных доставок растёт, другие подписчики события не затронуты;
  - `RetryLaterDeliveryError(retryAfterMs)` → `next_attempt_at = max(RetryPolicy, now + retryAfterMs)`, оба направления;
  - пауза засчитывается в лимит попыток;
  - запись результата по-прежнему защищена `claim_token`.
- [ ] 2.2 Прогнать тесты из 2.1 и зафиксировать, что они падают (red).
- [ ] 2.3 Добавить `PermanentDeliveryError` и `RetryLaterDeliveryError` в `shared/outbox/domain` и научить `OutboxRelay` их обрабатывать.
- [ ] 2.4 Прогнать тесты из 2.1 и все тесты `shared/outbox` и `modules/notifications` и зафиксировать, что они зелёные (green).

## 3. Доменная модель

- [ ] 3.1 Написать тесты `modules/telegram/domain/*.spec.ts`:
  - `TelegramIdentity`: положительные идентификаторы, нормализация username;
  - `LinkToken`: 32 символа base64url, срок, `digest` (sha256), `deepLink`, проверка формата параметра `start`;
  - `BotCommand.parse`: `/cmd`, `/cmd@BotName`, аргумент, чужой бот, неизвестная команда → `null`;
  - `TelegramLink`: `link` создаётся с включёнными уведомлениями, `relink` сохраняет `notificationsEnabled` и отклоняет другой `telegramUserId`, `enable`/`disableNotifications` обновляют `updatedAt`.
- [ ] 3.2 Прогнать тесты из 3.1 и зафиксировать, что они падают (red).
- [ ] 3.3 Реализовать VO `TelegramIdentity`, `LinkToken`, `BotCommand`, `IncomingMessage`, `BotSender`, `LinkResult`, агрегат `TelegramLink`, доменные ошибки (`InvalidLinkTokenError`, `TelegramAccountTakenError`, `TelegramNotLinkedError`, `TelegramNotConfiguredError`, `TelegramIdentityMismatchError`), порт `ClockPort`.
- [ ] 3.4 Прогнать тесты из 3.1 и зафиксировать, что они зелёные (green).

## 4. Хранение в Postgres

- [ ] 4.1 Написать интеграционные тесты:
  - `TelegramLinkRepository`: `findByUserId`, `findByTelegramUserId`, upsert `save`, нарушение `unique(telegram_user_id)` → `TelegramAccountTakenError`, `deleteByUserId` возвращает удалённую привязку, запись идёт через `executor()` транзакции;
  - `TelegramDeliveryLog.reserve`:
    - первая бронь → `reserved`;
    - повтор при `sent` или `skipped` → `done`;
    - свежая бронь `sending` → `{ inProgressUntil }`;
    - протухшая бронь перехватывается;
    - две параллельные брони — успешна только одна;
  - `markSent`, `markSkipped`, `release`.
- [ ] 4.2 Прогнать тесты из 4.1 и зафиксировать, что они падают (red).
- [ ] 4.3 Реализовать `TelegramLinkRepositoryPort`/`TelegramLinkRepository` и `TelegramDeliveryLogPort`/`TelegramDeliveryLog` с zod-валидацией строк.
- [ ] 4.4 Прогнать тесты из 4.1 и зафиксировать, что они зелёные (green).

## 5. Хранение в Redis

- [ ] 5.1 Написать тесты с реальным Redis:
  - `LinkTokenStore`: ключ `telegram:link-token:<digest>` с TTL; `consume` через `GETDEL` гасит токен один раз, второй вызов → `null`; из двух параллельных `consume` успешен один; в Redis нет открытого токена;
  - `UpdateDeduplicator`: `telegram:update:<id>`, `SET NX EX 86400`, повтор → `false`.
- [ ] 5.2 Прогнать тесты из 5.1 и зафиксировать, что они падают (red).
- [ ] 5.3 Реализовать `LinkTokenStorePort`/`LinkTokenStore` и `UpdateDeduplicatorPort`/`UpdateDeduplicator` на существующем подключении `ioredis`.
- [ ] 5.4 Прогнать тесты из 5.1 и зафиксировать, что они зелёные (green).

## 6. Клиент Bot API

- [ ] 6.1 Написать тесты `BotApiClient` и `BotMessenger` на локальном HTTP-сервере-заглушке:
  - `sendMessage`, `setWebhook`, `deleteWebhook`, `getUpdates` с zod-валидацией ответов;
  - адрес берётся из `TELEGRAM_API_BASE_URL`;
  - таймаут запроса `sendMessage` — 10 с;
  - классификация ошибок:
    - сеть и 5xx → `TransientDeliveryError`;
    - 429 с `retry_after` → `RetryLaterDeliveryError`;
    - 403 blocked или deactivated и 400 chat not found → `ChatUnavailableError`;
    - прочие 400 и 401 → `PermanentDeliveryError`;
  - токен не попадает ни в логи, ни в сообщения ошибок (по образцу теста `notifier.adapter`).
- [ ] 6.2 Прогнать тесты из 6.1 и зафиксировать, что они падают (red).
- [ ] 6.3 Реализовать `BotApiClient` и `BotMessengerPort`/`BotMessenger` в `infrastructure/telegram`.
- [ ] 6.4 Прогнать тесты из 6.1 и зафиксировать, что они зелёные (green).

## 7. Пользователи и выпуск ссылки

- [ ] 7.1 Написать тесты:
  - `UserDirectory.findActiveById`: активный → `{ id, login }`, отключённый или несуществующий → `null`;
  - `IssueLinkTokenUseCase`: ссылка `https://t.me/<bot>?start=<token>`, `expiresAt` через TTL, в хранилище только хеш, бот не настроен → `TelegramNotConfiguredError`, ссылки одного пользователя не отзывают друг друга;
  - `GetTelegramLinkStatusUseCase`: `isAvailable` по `isConfigured()`, поля привязки.
- [ ] 7.2 Прогнать тесты из 7.1 и зафиксировать, что они падают (red).
- [ ] 7.3 Реализовать `UserDirectoryPort`/`UserDirectory` (чтение `auth_users` без изменения поведения `auth`), `Clock`, `IssueLinkTokenUseCase`, `GetTelegramLinkStatusUseCase`, `TelegramLinkStatusView`.
- [ ] 7.4 Прогнать тесты из 7.1 и зафиксировать, что они зелёные (green).

## 8. Привязка, отвязка, переключатель

- [ ] 8.1 Написать тесты по spec `telegram-account-linking` и `telegram-notifications`:
  - `LinkAccountUseCase` в транзакции:
    - недействительный, протухший или уже использованный токен → `InvalidLinkTokenError`;
    - отключённый пользователь → `InvalidLinkTokenError`, токен сожжён;
    - Telegram занят другим пользователем → `TelegramAccountTakenError`, токен сожжён;
    - повторная привязка того же аккаунта → `relink` с сохранением настройки;
    - замена прежнего Telegram → `previousChatId` для сообщения об отвязке;
    - гонка двух ссылок на один `tgId` → `TelegramAccountTakenError`;
    - сообщения в чат уходят только после commit, их ошибка не откатывает привязку;
  - `UnlinkAccountUseCase`: идемпотентна, сообщение в прежний чат после commit;
  - `SetTelegramNotificationsUseCase`: включение и выключение, без привязки → `TelegramNotLinkedError`.
- [ ] 8.2 Прогнать тесты из 8.1 и зафиксировать, что они падают (red).
- [ ] 8.3 Реализовать `LinkAccountUseCase`, `UnlinkAccountUseCase`, `SetTelegramNotificationsUseCase` и тексты `BotReplies` (русский, HTML-экранирование `& < >`).
- [ ] 8.4 Прогнать тесты из 8.1 и зафиксировать, что они зелёные (green).

## 9. Диспетчер бота

- [ ] 9.1 Написать тесты `BotUpdateDispatcher`, `IdentityResolver`, `NotSupportedFreeTextHandler`:
  - повторный `update_id` пропускается;
  - не личный чат, нет `from` или нет текста → игнор;
  - отключённый пользователь считается непривязанным;
  - маршрутизация:
    - анонимный: `/start <token>` → привязка, остальное → инструкция по привязке;
    - привязанный: `/start` без токена и `/help` → справка, `/unlink`, `/mute`, `/unmute` → соответствующие use-cases, свободный текст → «пока не поддерживается»;
  - ошибка одного update логируется с `update_id` и не пробрасывается.
- [ ] 9.2 Прогнать тесты из 9.1 и зафиксировать, что они падают (red).
- [ ] 9.3 Реализовать `IdentityResolver`, `BotUpdateDispatcher`, `FreeTextHandlerPort` и `NotSupportedFreeTextHandler`.
- [ ] 9.4 Прогнать тесты из 9.1 и зафиксировать, что они зелёные (green).

## 10. Приём обновлений

- [ ] 10.1 Написать тесты:
  - `TelegramWebhookController`: неверный или отсутствующий секрет → 401 (сравнение за постоянное время), верный → 200 и вызов диспетчера, ошибка обработки → всё равно 200, эндпоинт публичный (без access-токена);
  - `TelegramUpdatesBootstrap`: `webhook` → `setWebhook(url, secret, allowed_updates=["message"])`, `polling` → `deleteWebhook` и запуск poller, `off` → ничего;
  - `TelegramUpdatesPoller` с реальным Redis: только держатель lock `telegram:poller:lock` вызывает `getUpdates`, lock продлевается, после потери lock второй экземпляр подхватывает, 409 → ожидание lock, корректная остановка на `onModuleDestroy`.
- [ ] 10.2 Прогнать тесты из 10.1 и зафиксировать, что они падают (red).
- [ ] 10.3 Реализовать `TelegramWebhookController`, `TelegramUpdatesBootstrap`, `TelegramUpdatesPoller`.
- [ ] 10.4 Прогнать тесты из 10.1 и зафиксировать, что они зелёные (green).

## 11. REST API привязки

- [ ] 11.1 Написать тесты контроллера и e2e `telegram-link-api.e2e.spec.ts`:
  - `GET /telegram/link`;
  - `POST /telegram/link-token`: 201, 503 `TELEGRAM_NOT_CONFIGURED`, 429 после 10 запросов в минуту;
  - `PATCH /telegram/link`: 200, 404 `TELEGRAM_NOT_LINKED`, 400 на невалидное тело;
  - `DELETE /telegram/link`: 204, повтор тоже 204;
  - 401 без токена для всех `/telegram/link*`.
- [ ] 11.2 Прогнать тесты из 11.1 и зафиксировать, что они падают (red).
- [ ] 11.3 Реализовать `TelegramLinkController`: схемы, Swagger, `@HttpCode`, карту доменных ошибок в HTTP, ограничение частоты по схеме throttling из `auth`.
- [ ] 11.4 Прогнать тесты из 11.1 и зафиксировать, что они зелёные (green).

## 12. Канал доставки `telegram`

- [ ] 12.1 Написать тесты `MessengerChannel` по spec `telegram-notifications` и design.md, решение 7:
  - доставка: сообщение `<b>{title}</b>\n{body}` в привязанный чат, затем `sent` с `message_id`;
  - нет привязки, уведомления выключены или пользователь отключён → `skipped` без отправки, а повтор после привязки не отправляет;
  - повтор после `sent` → без отправки;
  - свежая чужая бронь → `RetryLaterDeliveryError` до истечения брони, сообщение одно;
  - ошибки отправки:
    - сеть или 5xx → бронь снята, ошибка пробрасывается на ретрай;
    - 429 → `RetryLaterDeliveryError` с `retry_after`;
    - заблокированный бот или чат не найден → привязка удалена, доставка завершена без повторов;
    - прочие 400 и 401 → `PermanentDeliveryError`, привязка сохранена.
- [ ] 12.2 Прогнать тесты из 12.1 и зафиксировать, что они падают (red).
- [ ] 12.3 Реализовать `MessengerChannel` и зарегистрировать его в multi-provider каналов `notifications` (подписчик `notifications.channel.telegram` появляется автоматически). Метрики `telegram_messages_sent_total{kind}` и `telegram_send_errors_total{reason}`.
- [ ] 12.4 Прогнать тесты из 12.1 и зафиксировать, что они зелёные (green).

## 13. Сборка модуля и сквозной сценарий бэкенда

- [ ] 13.1 Написать e2e `telegram-flow.e2e.spec.ts` с заглушкой Bot API:
  - пользователь выпускает ссылку → webhook присылает `/start <token>` → привязка есть, бот ответил подтверждением с логином;
  - другой пользователь создаёт задачу на первого → в заглушку Bot API пришло ровно одно `sendMessage` с текстом уведомления, а WebSocket-доставка не пострадала;
  - `/mute` → следующее уведомление в Telegram не уходит;
  - 403 от заглушки → привязка снята, `GET /telegram/link` → `isLinked: false`;
  - 429 с `retry_after` → повтор не раньше срока;
  - при падающем Telegram доставка через WebSocket проходит.
- [ ] 13.2 Прогнать тест из 13.1 и зафиксировать, что он падает (red).
- [ ] 13.3 Собрать `TelegramModule` (контроллеры, use-cases, адаптеры, bootstrap, poller, канал) и подключить в `app.module.ts`. Логи по `.claude/rules/logging.md`, метрика `telegram_updates_total{result}`.
- [ ] 13.4 Прогнать тест из 13.1 и весь `npm test` бэкенда и зафиксировать, что всё зелёное (green). `npm run lint` и `npm run typecheck` без ошибок.

## 14. control-center: API и модель

- [ ] 14.1 Написать тесты:
  - `cc-api-protocol.test.ts`: `/telegram` пропускается прокси;
  - `lib/backend/telegram.schema.test.ts`, `telegram.api.test.ts`;
  - `telegram.queries.test.tsx`: `telegramLinkQuery` с `refetchInterval` при ожидании, `useIssueTelegramLinkToken`, `useSetTelegramNotifications` с оптимистичным обновлением и откатом, `useUnlinkTelegram` инвалидирует статус;
  - `features/telegram/use-telegram-link-flow.test.tsx`:
    - автомат `idle → issuing → waiting → linked / expired / error` плюс `unlinking`;
  - `remainingMs` тикает раз в секунду от `expiresAt` отдельно от опроса; имя бота берётся из `url`;
    - ссылка открывается через `window.open`;
    - ожидание заканчивается при `isLinked` или по `expiresAt`;
    - `reopenLink`, `cancel`;
    - `TELEGRAM_NOT_CONFIGURED` → отдельное состояние;
    - опрос во время ожидания не даёт скелетон.
- [ ] 14.2 Прогнать тесты из 14.1 и зафиксировать, что они падают (red).
- [ ] 14.3 Реализовать: префикс `/telegram` в `ALLOWED_PREFIXES`, `telegram.schema.ts`, `telegram.api.ts`, `telegram.queries.ts`, `useTelegramLinkFlow`.
- [ ] 14.4 Прогнать тесты из 14.1 и зафиксировать, что они зелёные (green).

## 15. control-center: UI (по ui-design.md)

- [ ] 15.1 Написать тесты компонентов:
  - `TelegramMenuItem`: «Не подключён» или `@username`, скрыт при `isAvailable = false`;
  - `TelegramDialog`: выбор панели по состоянию;
  - `TelegramConnectPanel`: «Подключить», ожидание с отсчётом, «Открыть ссылку ещё раз», «Отмена», «Ссылка устарела», ошибки;
  - `TelegramLinkedPanel`: username, время привязки, переключатель с ошибкой и откатом, «Отключить» с подтверждением.
- [ ] 15.2 Прогнать тесты из 15.1 и зафиксировать, что они падают (red).
- [ ] 15.3 Добавить `components/ui/switch` (shadcn на установленном Radix) по `Switch / Master` `sk9VP` (вкл/выкл/неактивен: `HSgzu`, `YVp53`, `AWv6p`). Сверстать пункт меню в `AccountMenu` по фрейму `YP1jv` (не подключён `k2uyUC`, пункт `EtU6w`, `@username` `wXLQm`, наведение `P4sFZq`, бот не настроен `RWZqu`) (design/synergy-design-kit.pen, читать через `mcp__pencil__execute`/Get).
- [ ] 15.4 Сверстать `TelegramDialog` (общий вид `B85lT1`, диалог `cKqtD`), `TelegramConnectPanel` (`Cw3vl`: не подключён `eE6pW`, выпуск `aWgBD`, ожидание с отсчётом `Z1XiV`, устарела `xa5nI`, сетевая ошибка `xUiGF`, бот не настроен `u2UW3C`) и `TelegramLinkedPanel` (`HWYte`: вкл `ZLBGV`, выкл `TWCPw`, ошибка переключателя `WX0Fn`, подтверждение `T32BA`, «Отключаем…» `QZYmJ`) и сверить со скриншотами.
- [ ] 15.5 Прогнать тесты из 15.1 и весь `npm test` control-center и зафиксировать, что они зелёные (green). `npm run typecheck` зелёный.

## 16. manager-helper: API и модель

- [ ] 16.1 Написать тесты:
  - `shared/telegram-api.test.ts` и `shared/telegram-schema.test.ts` (через `authFetch`, zod-схемы ответов, коды ошибок);
  - `options/telegram/use-telegram-link.test.tsx`: тот же автомат состояний, `chrome.tabs.create` для ссылки, интервал 2 с только пока раздел смонтирован и ссылка не истекла, очистка интервала при размонтировании, «не залогинен».
- [ ] 16.2 Прогнать тесты из 16.1 и зафиксировать, что они падают (red).
- [ ] 16.3 Реализовать `shared/telegram-api.ts`, `shared/telegram-schema.ts`, `useTelegramLink`.
- [ ] 16.4 Прогнать тесты из 16.1 и зафиксировать, что они зелёные (green).

## 17. manager-helper: UI (по ui-design.md)

- [ ] 17.1 Написать тесты компонентов `TelegramSection` (все состояния, включая «не залогинен» и «бот не настроен») и `InlineConfirm` (подтверждение и отмена без `confirm()`).
- [ ] 17.2 Прогнать тесты из 17.1 и зафиксировать, что они падают (red).
- [ ] 17.3 Сверстать `TelegramSection` и `InlineConfirm` на странице options по фреймам `xtLrN` (не подключён `gTseJ`, ожидание `H5YM5P`, подключён `z6bGDn`, `InlineConfirm` `dHVaJ`/`mC91s`, вход не выполнен `oKL2I`, бот не настроен `j26Hd4`) и `s0tCX2` (загрузка `O4A1aG`, выпуск `URklO`, устарела `NPyux`, сетевая ошибка `QoSUi`, выключено `h9xU7m`, ошибка переключателя `p77cX`, «Отключаем…» `M7Wei2`, `TELEGRAM_NOT_CONFIGURED` `bdfhI`) и подключить в `options/App`.
- [ ] 17.4 Прогнать тесты из 17.1 и весь `npm test` manager-helper и зафиксировать, что они зелёные (green). `npm run typecheck` и `npm run lint` без ошибок.

## 18. Проверка UI

- [ ] 18.1 Проверить control-center по `.claude/rules/frontend-ui-verification.md` через `electron-stagewright`. Бэкенд запущен с `TELEGRAM_UPDATES_MODE=webhook` и заглушкой Bot API, `/start <token>` присылается в webhook curl-ом. Пройти: пункт меню, подключение, ожидание, привязка, переключатель, отключение, устаревшая ссылка, «бот не настроен». Скриншоты сверить с фреймами из 15.3–15.4, консоль без ошибок.
- [ ] 18.2 Проверить manager-helper через MCP `extension` (страница options, после `npx vite build`) по тем же сценариям, включая «не залогинен». Скриншоты сверить с фреймами из 17.3, консоль без ошибок.

## 19. Сквозная проверка

- [ ] 19.1 Прогнать `npm test`, `npm run typecheck`, `npm run lint` во всех трёх пакетах. Выполнить `openspec validate add-telegram-account-linking --strict`.
- [ ] 19.2 Поднять бэкенд с заглушкой Bot API. Пользователь привязывает Telegram в control-center, второй пользователь создаёт ему задачу. Уведомление приходит в оба клиента и одним сообщением в заглушку Bot API. Отвязка в manager-helper сразу отражается в control-center. Результат коротко зафиксировать в описании PR.
- [ ] 19.3 (Пользователь, после создания бота у BotFather.) Задать `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` и `TELEGRAM_UPDATES_MODE=polling` локально, привязать настоящий аккаунт, получить уведомление о назначенной задаче, проверить `/mute`, `/unmute`, `/unlink`.

## 20. Code review

- [ ] 20.1 Запустить code-review (скилл `code-review`) по всем изменениям фичи — от коммита, с которого начат change, до текущего HEAD: соответствие стандартам проекта и specs этого change
- [ ] 20.2 Исправить замечания ревью (блокирующие и существенные обязательно; остальные — исправить или явно отклонить с обоснованием), результат зафиксировать коммитом
- [ ] 20.3 Повторить code-review по правкам из 20.2 и убедиться, что блокирующих и существенных замечаний нет; прогнать тесты и зафиксировать, что они зелёные
