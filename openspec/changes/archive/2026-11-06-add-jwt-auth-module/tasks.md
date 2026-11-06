## 1. Spike: cookie из расширения (гейт для клиентской части)

- [ ] 1.1 Собрать минимальный стенд: бэкенд-эндпоинт, ставящий cookie `mh_refresh` (`HttpOnly`, `SameSite=Strict`, `Path=/auth`), и вызов `fetch(..., {credentials: 'include'})` из sidepanel и из service worker расширения с `host_permissions` на `http://localhost/*`. Проверка: в `docs/` или в описании change зафиксировать таблицу «контекст (sidepanel/background/options) × cookie ушла/не ушла» для Chrome с включённой и отключённой блокировкой сторонних cookie
- [ ] 1.2 Принять решение по итогам 1.1. Cookie уходит во всех контекстах: продолжаем по `design.md` (п. 1). Не уходит: перед группами 10–13 согласовать с пользователем переход на запасной вариант (refresh в теле, `chrome.storage.local` с `TRUSTED_CONTEXTS`) и обновить specs/design. Проверка: решение записано в `design.md`, пользователь уведомлён

## 2. Backend: зависимости, конфигурация, миграция

- [x] 2.1 Добавить зависимости `@nestjs/jwt`, `argon2`, `@nestjs/throttler`, `cookie-parser` (+ типы) в `backend/package.json`. Проверка: `npm ci` и `npm run typecheck` в `backend/` проходят
- [x] 2.2 Расширить `shared/config/env.schema.ts`: `JWT_SECRET` (мин. 32 символа), `AUTH_ACCESS_TTL` (по умолчанию 15m), `AUTH_REFRESH_TTL` (14d), `AUTH_REFRESH_GRACE_SECONDS` (10), `AUTH_LOGIN_MAX_ATTEMPTS`/`AUTH_LOGIN_WINDOW_MINUTES` (5/15), `AUTH_ALLOWED_ORIGINS` (список, включая `chrome-extension://<id>`), `AUTH_SEED_USERS` (JSON, опционально). Проверка: расширить `env.schema.spec.ts` (валидные и невалидные значения), тесты зелёные
- [x] 2.3 Создать `backend/db/migrations/013_auth.sql`: таблицы `auth_users` (уникальный индекс по `lower(login)`), `auth_sessions`, `auth_refresh_tokens` (уникальный `token_hash`, индекс по `session_id`), внешние ключи. Проверка: по образцу `chat-sessions-migration.spec.ts` написать spec миграции, он применяет миграцию к тестовой БД и проверяет таблицы и ограничения

## 3. Backend domain: value objects и PasswordPolicy (TDD)

- [x] 3.1 Написать тесты по `architecture.md` и `specs/user-auth`: `Login` (trim, нижний регистр, пустой и слишком длинный логин), `PlainPassword`/`PasswordPolicy.validate` (длина ≥ 10, буква и цифра, не равен логину, не равен текущему хэшу), `ClientType` (`cookie`/`desktop`, неизвестное значение отклоняется). Убедиться, что раннер их видит
- [x] 3.2 Прогнать тесты из 3.1 и зафиксировать, что они падают (red): классов ещё нет
- [x] 3.3 Реализовать `Login`, `PlainPassword`, `PasswordHash`, `ClientType`, `AccessClaims`, `TokenPair`, `PasswordPolicy` в `modules/auth/domain`
- [x] 3.4 Прогнать тесты из 3.1: зелёные; прогнать `npm test` в `backend/`, регрессий нет

## 4. Backend domain: User (TDD)

- [x] 4.1 Написать тесты на `User`: создание с временным паролем даёт `mustChangePassword = true`; `changePassword` сбрасывает флаг и обновляет `passwordChangedAt`; отключённый пользователь (`isActive = false`) не проходит проверку входа. Раннер их видит
- [x] 4.2 Прогнать тесты из 4.1: red (нет сущности)
- [x] 4.3 Реализовать `User` и порт `UserRepository` (`findByLogin`, `findById`, `save`, `existsByLogin`)
- [x] 4.4 Прогнать тесты из 4.1: зелёные, регрессий нет

## 5. Backend domain: AuthSession и ротация refresh (TDD)

- [x] 5.1 Написать тесты на `AuthSession.rotate` по сценариям `specs/user-auth` («Обновление токенов с ротацией», «Обнаружение повторного использования»): успешная ротация (старый токен помечен использованным, создан новый), просроченный токен, неизвестный токен, повтор в окне допуска (`Race`, сессия жива), повтор вне окна (`ReuseDetected`, сессия отозвана, все токены недействительны), отозванная сессия; `revoke` идемпотентен. Раннер их видит
- [x] 5.2 Прогнать тесты из 5.1: red
- [x] 5.3 Реализовать `AuthSession`, `RefreshToken`, `RotationResult` и порт `AuthSessionRepository` (`findByTokenHash` с блокировкой строки, `save`, `revokeAllForUser(userId, exceptSessionId?)`), ошибки домена (`InvalidRefreshTokenError`, `RefreshRaceError`)
- [x] 5.4 Прогнать тесты из 5.1: зелёные, регрессий нет

## 6. Backend application: LoginUseCase (TDD)

- [x] 6.1 Написать тесты с фейковыми портами: успешный вход создаёт сессию и возвращает `TokenPair` и `mustChangePassword`; неверный логин, неверный пароль и отключённый пользователь дают одинаковую `InvalidCredentialsError`; для несуществующего логина выполняется фиктивная проверка хэша (выравнивание времени)
- [x] 6.2 Прогнать тесты из 6.1: red
- [x] 6.3 Реализовать `LoginUseCase` и порты `PasswordHasher`, `AccessTokenService`, `RefreshTokenFactory`, `Clock`
- [x] 6.4 Прогнать тесты из 6.1: зелёные, регрессий нет

## 7. Backend application: RefreshSessionUseCase и LogoutUseCase (TDD)

- [x] 7.1 Написать тесты: refresh вызывает `AuthSession.rotate`, выпускает новый access, при `Race` бросает `RefreshRaceError`, при `ReuseDetected` сохраняет отозванную сессию и бросает `InvalidRefreshTokenError`, при отключённом пользователе отказывает; logout отзывает сессию, идемпотентен, не падает без токена
- [x] 7.2 Прогнать тесты из 7.1: red
- [x] 7.3 Реализовать `RefreshSessionUseCase`, `LogoutUseCase`
- [x] 7.4 Прогнать тесты из 7.1: зелёные, регрессий нет

## 8. Backend application: ChangePasswordUseCase и GetCurrentUserUseCase (TDD)

- [x] 8.1 Написать тесты по сценариям «Принудительная смена временного пароля»: успех (флаг сброшен, прочие сессии пользователя отозваны, выдана новая пара токенов с `mcp = false`), неверный текущий пароль, новый равен текущему, слабый пароль (список нарушений); `GetCurrentUserUseCase` возвращает `id`, `login`, `mustChangePassword` и не возвращает хэш
- [x] 8.2 Прогнать тесты из 8.1: red
- [x] 8.3 Реализовать `ChangePasswordUseCase`, `GetCurrentUserUseCase` и ошибки `WrongPasswordError`, `WeakPasswordError`, `SamePasswordError`
- [x] 8.4 Прогнать тесты из 8.1: зелёные, регрессий нет

## 9. Backend application: SeedUsersUseCase (TDD)

- [x] 9.1 Написать тесты по «Сидирование пользователей»: создаёт пользователей с `mustChangePassword = true`, генерирует пароль, если он не задан, возвращает `generatedPassword` один раз, существующий логин пропускается и не перезаписывается
- [x] 9.2 Прогнать тесты из 9.1: red
- [x] 9.3 Реализовать `SeedUsersUseCase` и CLI `backend/scripts/seed-users` (читает `AUTH_SEED_USERS`, печатает сгенерированные пароли в stdout один раз, не пишет их в лог приложения), добавить npm-скрипт `seed:users`
- [x] 9.4 Прогнать тесты из 9.1: зелёные; запустить CLI на пустой тестовой БД, затем повторно: убедиться, что повтор ничего не меняет

## 10. Backend infrastructure (TDD)

- [x] 10.1 Написать тесты: `Argon2PasswordHasher` (хэш проверяется, разные соли), `JwtAccessTokenService` (sign/verify, различает `Expired` и `Invalid`, чужой ключ отвергается), `CryptoRefreshTokenFactory` (256 бит, хэш детерминирован), `SlonikUserRepository` и `SlonikAuthSessionRepository` (интеграционные, по образцу `postgres-chat-session-repository.spec.ts`: сохранение цепочки токенов, блокировка строки при параллельном `rotate`, `revokeAllForUser`)
- [x] 10.2 Прогнать тесты из 10.1: red
- [x] 10.3 Реализовать адаптеры в `modules/auth/infrastructure`
- [x] 10.4 Прогнать тесты из 10.1: зелёные, регрессий нет

## 11. Backend interface: контроллер, cookie и guard-ы (TDD)

- [x] 11.1 Написать тесты (по образцу `agent.controller.spec.ts`): `login`/`refresh`/`logout`/`change-password`/`me`; cookie-клиент получает `Set-Cookie` (`HttpOnly`, `SameSite=Strict`, `Path=/auth`) и не получает refresh в теле; `X-Client-Type: desktop` получает refresh в теле без cookie; неизвестный `X-Client-Type` даёт 422; `OriginGuard` отклоняет чужой и пустой `Origin` на `refresh`/`logout`; `JwtAuthGuard`: нет токена, просрочен (код «истёк»), повреждён (код «недействителен»), `@Public()` пропускает; `PasswordChangeGuard` даёт 403 `PASSWORD_CHANGE_REQUIRED` для всех маршрутов, кроме `change-password`, `me`, `logout`; throttler даёт 429 с временем ожидания
- [x] 11.2 Прогнать тесты из 11.1: red
- [x] 11.3 Реализовать `AuthController`, `RefreshCookieService`, `JwtAuthGuard`, `PasswordChangeGuard`, `OriginGuard`, `LoginThrottlerGuard` (хранилище Redis), декораторы `@Public()`, `@AllowPendingPasswordChange()`, `@CurrentUser()`, DTO/ответы с zod-схемами и документацией OpenAPI; маппинг ошибок в `HttpExceptionFilter` (401, 403, 409 `REFRESH_RACE`, 422, 429)
- [x] 11.4 Прогнать тесты из 11.1: зелёные, регрессий нет

## 12. Backend: подключение модуля и защита существующих эндпоинтов

- [ ] 12.1 Написать интеграционный тест полного сценария (login → вызов защищённого эндпоинта → просрочка access → refresh → смена пароля → logout) и тест, что существующие контроллеры (`sheets-qa`, `audit-agent`) без токена отвечают 401, а `GET /health`, `/docs`, `/openapi.json` доступны. Прогнать: red
- [x] 12.2 Подключить `AuthModule` в `AppModule`, зарегистрировать `JwtAuthGuard` и `PasswordChangeGuard` как `APP_GUARD`, добавить `cookie-parser`, CORS с точным списком `AUTH_ALLOWED_ORIGINS` и `credentials: true` в `main.ts`, пометить `@Public()` health и документацию
- [ ] 12.3 Прогнать тесты из 12.1: зелёные; `npm run typecheck`, `npm run lint`, `npm test` в `backend/` без регрессий (в том числе существующие спеки `sheets-qa` с учётом токена в тестовых модулях)

## 13. Frontend: слой `shared/auth` (TDD)

- [x] 13.1 Написать тесты (vitest, `manager-helper`): `access-token-store` (токен только в памяти, не пишется в `chrome.storage`), `auth-api` (вызовы `/auth/*` с `credentials: 'include'`, типизированные ошибки `InvalidCredentials`, `RateLimited(retryAfter)`, `PasswordChangeRequired`), `refresh-coordinator` (три параллельных 401 дают один запрос refresh; два контекста обновляются строго по очереди через `navigator.locks`), `auth-fetch` (Bearer, при 401 «токен истёк» один refresh и повтор запроса, при 401 на refresh токен очищается и публикуется событие), `session-channel` (`BroadcastChannel`: выход в одном контексте уведомляет остальные), `use-auth-session` (статусы `restoring`, `anonymous`, `must-change-password`, `authenticated`, `offline`; при недоступном сервере не уходит в `anonymous`)
- [x] 13.2 Прогнать тесты из 13.1: red
- [x] 13.3 Реализовать `src/shared/auth` (`auth-api.ts`, `access-token-store.ts`, `refresh-coordinator.ts`, `auth-fetch.ts`, `session-channel.ts`, `use-auth-session.ts`, `index.ts` как единственный публичный API)
- [x] 13.4 Прогнать тесты из 13.1: зелёные; `npm test`, `npm run typecheck`, `npm run lint` в `manager-helper/` без регрессий

## 14. Frontend: подключение существующих клиентов, manifest, настройки (TDD)

- [x] 14.1 Обновить существующие тесты `agent-client.test.ts`, `threads-api.test.ts` (запросы идут с Bearer через `authFetch`, 403 `PASSWORD_CHANGE_REQUIRED` переводит сессию в `must-change-password`) и добавить тесты для `settings.ts` (смена адреса запрашивает `chrome.permissions` на новый хост и сбрасывает сессию). Прогнать: red
- [ ] 14.2 Перевести `agent-client.ts`, `threads-api.ts` и запросы из `background` на `authFetch`; в `settings.ts` добавить запрос разрешений и сброс сессии при смене адреса; в `manifest.config.ts` добавить `key` (фиксированный ID расширения) и `optional_host_permissions` для удалённого бэкенда; значение `chrome-extension://<id>` внести в `AUTH_ALLOWED_ORIGINS`
- [x] 14.3 Прогнать тесты из 14.1: зелёные, регрессий нет; `npm run build` в `manager-helper/` проходит

## 15. UI: вход, смена пароля, состояния сессии (по ui-design.md)

Дизайн: `design/synergy-design-kit.pen`, корневой фрейм `l7JLmb`. Перед вёрсткой прочитать нужный фрейм через `mcp__pencil__execute`/`Get` и сверить результат со скриншотом (`TakeScreenshot`). Компоненты UI Kit: `Button / Master`, `Field / Master`, `Run Notice / Master`; токены из `src/shared/styles.css`.

- [x] 15.1 Написать тесты (testing-library, как в `ChatHeader.test.tsx`): `LoginForm` (отправка, показ ошибки 401, блокировка кнопки и обратный отсчёт при 429, поля не пустые), `ChangePasswordDialog` (подтверждение должно совпадать, новый не равен текущему, список нарушений политики с сервера, нет кнопки закрытия, «Выйти» вызывает `logout`), `AuthGate` (по статусу показывает вход, смену пароля, восстановление, «нет связи» с «Повторить», или `children`)
- [x] 15.2 Прогнать тесты из 15.1: red
- [x] 15.3 Реализовать `LoginForm` по фреймам `b2NQbR` (по умолчанию), `WjhzF` (401), `E1eKUp` (429); `ChangePasswordDialog` по `S7Bn7v` (первый вход), `W0ztxs` (равен временному), `d7tBz` (подтверждение не совпадает), `RlRtb` (ошибка сервера); `AuthGate` с экранами `i2Px5` (восстановление) и `phCLJ` (нет связи); ссылка «Изменить» у адреса сервера открывает `options`. Неактивная кнопка: заливка `grey-30`, текст `ink-40`
- [ ] 15.4 Прогнать тесты из 15.1: зелёные; обернуть `sidepanel/App.tsx` в `AuthGate`; сверить экраны со скриншотами фреймов из 15.3
- [x] 15.5 Страница `options` по фреймам `U2XE2Y` (вход выполнен: «Вы вошли как …» и «Выйти») и `K23ifk` (вход не выполнен: подсказка), без `AuthGate` (согласовано в `ui-design.md`, отклонение 1). Тест: блок «Аккаунт» меняется по статусу сессии, адрес сервера доступен без входа. Логика есть, поэтому тест пишется до реализации и проходит red → green

## 16. Развёртывание и документация

- [ ] 16.1 Описать в `backend/README.md` и в README `manager-helper` переменные окружения auth, запуск сидера (`npm run seed:users`), порядок выката (миграция при старте, сидер, выпуск расширения с экраном входа, включение guard-а) и откат. Проверка: по описанию на чистой БД выполнить развёртывание и первый вход
- [ ] 16.2 Ручная проверка в Chrome на реальном расширении: вход временным паролем, обязательная смена пароля, перезагрузка панели без повторного входа, истечение access (короткий TTL в `.env`), выход в панели и экран входа в открытых `options`, неверный пароль, лимит попыток, остановка бэкенда (экран «нет связи»). Результат зафиксировать в описании change

## 17. Code review

- [x] 17.1 Запустить code-review (скилл `code-review`) по всем изменениям фичи - от коммита, с которого начат change, до текущего HEAD: соответствие стандартам проекта и specs этого change
- [ ] 17.2 Исправить замечания ревью (блокирующие и существенные обязательно; остальные - исправить или явно отклонить с обоснованием), результат зафиксировать коммитом
- [x] 17.3 Повторить code-review по правкам из 17.2 и убедиться, что блокирующих замечаний нет; прогнать тесты и зафиксировать, что они зелёные

## Примечания по реализации

Состояние: реализованы домен, application, infrastructure, interface, AuthModule с подключением в AppModule и клиентская часть. Открыты: группа 1, 12.1, 12.3, 14.2, 15.4, 16.1, 16.2, 17.2.

### Блокеры и не закрытые пункты
- Группа 1 (спайк cookie): не выполнялся. Группы 13-15 сделаны до решения по cookie; решение пользователя по 1.1/1.2 всё ещё нужно.
- 9.4: CLI `seed:users` не запускался. `scripts/seed-users.mjs` импортирует несуществующий `dist/modules/auth/auth.module.js` (нужны группы 10-12).
- Группы 10, 11, 12: не выполнены (нет Argon2/JWT/Slonik-адаптеров, AuthController, cookie, JwtAuthGuard, PasswordChangeGuard, OriginGuard, throttler, AuthModule в AppModule). Блокировка строки при параллельном refresh не проверена. Коды TOKEN_EXPIRED, RATE_LIMITED, FORBIDDEN_ORIGIN, REFRESH_RACE на сервере пока не выдаются.
- 14.2: не отмечен. `background` не обращается к бэкенду (изменений не потребовалось), но origin `chrome-extension://facoikcjgloanpnjokljdemgipikeoho` не внесён в `AUTH_ALLOWED_ORIGINS`.
- 15.4: не отмечен. Тесты зелёные, но визуальная сверка со скриншотами фреймов и вёрстка options по U2XE2Y/K23ifk не проверены глазами.
- 16.1: не отмечен. README написаны, но развёртывание на чистой БД невозможно без AuthModule. 16.2: ручная проверка не выполнялась.
- 17.1: code-review выполнен. 17.2: не отмечен. Исправлены 6 major-замечаний, но блокирующее замечание (нет infrastructure/interface/AuthModule) и major про сидер не исправлены, коммит не сделан. 17.3: не отмечен, повторный review вернул блокирующее замечание.

### Отклонения от артефактов
- Новый пароль, равный текущему: правило `same-as-current` убрано из `PasswordPolicy.validate` (сравнивало открытый пароль с хэшем), проверку выполняет `ChangePasswordUseCase` через `PasswordHasher` (SamePasswordError). Формулировка 3.1 устарела.
- 2.1: `npm ci` отдельно не запускался; `npm install` обновил lock-файл, typecheck проходит. 2.3: spec миграции пропускается без `PROGRAMS_ETL_TEST_ADMIN_URL`, прогнан на локальной БД.
- Env: `JWT_SECRET` без значения по умолчанию; `AUTH_ALLOWED_ORIGINS` - строка через запятую; TTL только формата `\d+[smhd]`; `password` в `AUTH_SEED_USERS` необязателен; флага `AUTH_ENFORCED` из design.md нет. `.env.example` обновлён, docker-compose нет.
- Миграция 013 добавляет `must_change_password`, `is_active`, `password_changed_at`, `created_at`, `replaced_by_id`, индекс `auth_sessions_user_idx`; имена колонок выбраны самостоятельно.
- Сигнатуры: `AuthSession.rotate(presentedHash, next, now, graceMs)`; `AccessTokenService.sign` возвращает `{token, expiresIn}`; use cases не принимают `client`; добавлены порты TransactionRunner, AuthSettings, PasswordGenerator, `PasswordHasher.verifyDummy`; `TokenPair` содержит `mustChangePassword`.
- `ChangePasswordUseCase` ротирует активный refresh-токен сессии для выдачи новой пары.
- Контракт ошибок: доменные ошибки наследуют `BaseError`, `ApiErrorResponse` получил `code`, `violations`, `retryAfterSeconds`, фильтр ставит `Retry-After`; реестр статусов `registerAuthErrorStatuses()` должен вызываться при инициализации модуля (группа 11). Контракт нужно отразить в specs и design.md.
- `test-doubles.ts` лежит в `application/` и попадает в сборку (импортирует vitest): перенести или исключить в tsconfig.build.
- Клиент: добавлены `auth-state.ts`, `auth-service.ts`; `useAuthSession` отдаёт `retry` и `notice`; `authFetch` принимает абсолютный URL и обновляет токен также при TOKEN_INVALID; `setBackendUrl` возвращает boolean, требует https для всех хостов кроме localhost/127.0.0.1; `AuthGate` обёрнут вокруг App в `sidepanel/main.tsx`; `shared/auth/ui` импортирует `RunNotice` и иконки из `sidepanel`.
- Открытые minor-замечания review: `password_changed_at` допускает NULL, нет индекса по `expires_at`, `randomUUID` без порта IdGenerator, рост цепочки токенов в `AuthSession`, `authFetch` не проверяет 403 после refresh и пробрасывает ошибки refresh.
- Фиксированный ID расширения: facoikcjgloanpnjokljdemgipikeoho (приватный ключ не сохранён в репозитории).

### Прогон: infrastructure, interface, исправления ревью
- Тесты: `npm test` 75 файлов, 561 тест зелёные (при `PROGRAMS_ETL_TEST_ADMIN_URL` и локальном Redis; без них интеграционные спеки пропускаются), typecheck, lint, build чистые. Сидер запущен на временной БД Postgres дважды: повтор ничего не меняет (9.4).
- Не отмечены: 12.1 (полный сценарий login -> refresh -> смена пароля -> logout против реальной БД и 401 на sheets-qa/audit-agent не подтверждён; `auth.module.spec` проверяет подключение на фейковых репозиториях), 12.3 (зависит от 12.1; AppModule целиком не запускался, нужен MSSQL), 14.2 (в `.env.example` стоит `chrome-extension://REPLACE_WITH_EXTENSION_ID`; ID facoikcjgloanpnjokljdemgipikeoho нужно внести при выкате), 15.4 (нет визуальной сверки), 16.1 (развёртывание на чистой БД по README не выполнялось), 16.2 (ручная проверка не выполнялась), группа 1 (спайк не выполнялся).
- 17.2 не отмечен: блокирующие и major-замечания исправлены, но коммит не сделан, а повторное ревью нашло новое major (`/metrics` закрыт глобальным JwtAuthGuard без `@Public()`, скрейп Prometheus получит 401). 17.3 отмечен: блокирующих замечаний повторное ревью не вернуло, тесты зелёные; major по `/metrics` остаётся открытым и входит в 17.2.
- Отклонения infrastructure: добавлены ошибки `AccessTokenExpiredError`, `AccessTokenInvalidError`, код `TOKEN_EXPIRED` (401); `SlonikTransactionRunner` хранит транзакцию в AsyncLocalStorage; `JwtAccessTokenService` принимает `{secret, ttlSeconds, clock}`, HS256; `revokeAllForUser` ставит `revoked_at = now()` в SQL; `save` делает upsert токенов и затем `replaced_by_id`; argon2id с параметрами по умолчанию.
- Отклонения interface: `@nestjs/throttler` не используется и удалён, ограничитель - собственный `LoginThrottler` с портом `LoginAttemptStore` и Redis (Lua INCR+PEXPIRE), счёт до проверки пароля с возвратом при успехе; при сбое Redis fail-open с логом; неверный текущий пароль в change-password учитывается тем же лимитером; добавлены коды `RATE_LIMITED` (429), `FORBIDDEN_ORIGIN` (403), `INVALID_CLIENT_TYPE` (422, нужно подтвердить); `logout` публичный, защищён Origin и refresh-токеном; `Secure` для cookie определяется по `request.hostname`; порты `AuthSessionRepository.findByIdForUpdate`, `LoginAttemptStore.increment/decrement`; `ChangePasswordUseCase` сначала ротирует токен, затем пишет пользователя.
- Принятый риск: `JwtAuthGuard` не проверяет сессию и пользователя, access-токен действует до `AUTH_ACCESS_TTL` (design.md, разделы 3 и 5).
- Подключение: `AuthSeedModule` для сидера (AuthModule не импортирует AppConfigModule); `configureHttp()` в `main.ts` (cookie-parser, CORS с credentials и Retry-After, trust proxy); новый env `TRUST_PROXY`; `tsconfig.build.json` исключает `test-doubles.ts` и `testing/` (закрывает замечание о test-doubles); `/openapi.json` перенесён на `app.use`; `GET /health` помечен `@Public()`.
- Блокеры выката: `chrome-extension://facoikcjgloanpnjokljdemgipikeoho` внести в `AUTH_ALLOWED_ORIGINS`, иначе refresh и logout дадут `FORBIDDEN_ORIGIN`; за прокси задать `TRUST_PROXY`; `/metrics` требует `@Public()` или иной защиты; клиент: `logout()` без access-токена не вызывает сервер, а 403 FORBIDDEN_ORIGIN и повторный 409 при refresh показываются как «нет связи» (minor, не исправлено).
