# Architecture: add-jwt-auth-module

## Scope
Новый бэкенд-модуль `auth` (NestJS, PostgreSQL через Slonik) в слоях `domain / application / infrastructure / interface`, как в `sheets-qa`, плюс auth-слой и UI входа в расширении `manager-helper`. Остальные модули затрагиваются только глобальными guard-ами. Отдельного модуля `users` нет: пользователи нужны только для аутентификации и живут внутри `auth` (уточнение к `proposal.md`).

Фронтенд здесь не FSD: `frontend/CLAUDE.md` и `manager-helper/CLAUDE.md` в репозитории нет. Структура следует существующей раскладке `manager-helper/src` (`shared/`, `sidepanel/`, `options/`, `background/`).

---

## Backend — Domain Model

### Entities
| Name | Status | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `User` | new | да | `id`, `login: Login`, `passwordHash: PasswordHash`, `mustChangePassword`, `isActive`, `createdAt`, `passwordChangedAt` | Учётная запись; хранит признак принудительной смены пароля |
| `AuthSession` | new | да | `id`, `userId`, `createdAt`, `revokedAt`, `tokens: RefreshToken[]` | Один вход на одном устройстве; владеет цепочкой refresh-токенов |
| `RefreshToken` | new | нет (внутри `AuthSession`) | `id`, `tokenHash`, `expiresAt`, `usedAt`, `replacedById` | Звено цепочки ротации |

### Aggregates
| Aggregate | Root entity | Входит в состав | Инварианты |
|---|---|---|---|
| `User` | `User` | `Login`, `PasswordHash` | Логин уникален и хранится в нижнем регистре; `mustChangePassword` сбрасывается только сменой пароля; новый пароль не равен текущему и логину |
| `AuthSession` | `AuthSession` | `RefreshToken[]` | В сессии не более одного неиспользованного токена; использованный токен повторно не принимается; повторное предъявление вне окна допуска отзывает всю сессию; отозванная сессия не обновляется |

### Value Objects
| Name | Поля | Почему VO |
|---|---|---|
| `Login` | `value` | Нормализация (trim, lower-case) и проверка формата при создании |
| `PlainPassword` | `value` | Самопроверка по политике (длина ≥ 10, буква и цифра); не логируется и не сериализуется |
| `PasswordHash` | `value` | Неизменяемая строка argon2id |
| `RefreshTokenSecret` | `value` | Случайные 256 бит; существует только в памяти, наружу уходит хэш `tokenHash` |
| `ClientType` | `'cookie' \| 'desktop'` | Выбор способа передачи refresh по `X-Client-Type` |
| `AccessClaims` | `sub`, `sid`, `mcp`, `jti`, `exp` | Содержимое access-токена |
| `TokenPair` | `access`, `expiresIn`, `refresh` | Результат входа и обновления |

### Services
| Service | Слой | Ответственность |
|---|---|---|
| `PasswordPolicy` | domain | Правила пароля, возвращает список нарушений |
| `LoginUseCase` | application | Проверка пароля, создание сессии и первой пары токенов |
| `RefreshSessionUseCase` | application | Ротация refresh, окно допуска, отзыв при повторном использовании |
| `LogoutUseCase` | application | Идемпотентный отзыв сессии |
| `ChangePasswordUseCase` | application | Смена пароля, сброс `mustChangePassword`, отзыв прочих сессий, новая пара токенов |
| `GetCurrentUserUseCase` | application | Профиль текущего пользователя |
| `SeedUsersUseCase` | application | Создание пользователей из конфигурации, без перезаписи существующих |
| Порты `UserRepository`, `AuthSessionRepository`, `PasswordHasher`, `AccessTokenService`, `RefreshTokenFactory`, `Clock` | domain/ports | Границы с инфраструктурой |
| `SlonikUserRepository`, `SlonikAuthSessionRepository` | infrastructure | Хранение в PostgreSQL, транзакция и блокировка строки при `refresh` |
| `Argon2PasswordHasher`, `JwtAccessTokenService`, `CryptoRefreshTokenFactory` | infrastructure | Реализации портов |
| `AuthController` | interface/http | `login`, `refresh`, `logout`, `change-password`, `me` |
| `RefreshCookieService` | interface/http | Установка и удаление cookie `mh_refresh`, выбор способа по `ClientType` |
| `JwtAuthGuard` (`APP_GUARD`), `PasswordChangeGuard` (`APP_GUARD`), `OriginGuard`, `LoginThrottlerGuard` | interface/http | Проверка токена, блок до смены пароля, белый список `Origin`, лимиты |
| Декораторы `@Public()`, `@AllowPendingPasswordChange()`, `@CurrentUser()` | interface/http | Разметка маршрутов |
| CLI `scripts/seed-users` | вне модуля | Вызывает `SeedUsersUseCase`, печатает сгенерированные пароли один раз |

### Method Signatures (ключевые)
| Service.Method | Params | Returns | Описание |
|---|---|---|---|
| `LoginUseCase.execute` | `login: string, password: string, client: ClientType` | `TokenPair & { mustChangePassword }` | Одинаковая ошибка при неверном логине, пароле и отключённом пользователе |
| `RefreshSessionUseCase.execute` | `refreshSecret: string, client: ClientType` | `TokenPair` | Ошибки: `InvalidRefresh`, `RefreshRace`, `SessionRevoked` |
| `LogoutUseCase.execute` | `refreshSecret?: string` | `void` | Не падает без токена |
| `ChangePasswordUseCase.execute` | `userId, sessionId, current: string, next: string` | `TokenPair` | Ошибки: `WrongPassword`, `WeakPassword(violations)`, `SamePassword` |
| `GetCurrentUserUseCase.execute` | `userId` | `{ id, login, mustChangePassword }` | Без хэша |
| `SeedUsersUseCase.execute` | `entries: { login, password? }[]` | `{ created: { login, generatedPassword? }[], skipped: string[] }` | Идемпотентен |
| `AuthSession.rotate` | `presented: tokenHash, now, graceMs` | `RotationResult` | Возвращает `Rotated`, `Race` или `ReuseDetected`; при последнем сессия отзывается |
| `User.changePassword` | `hash: PasswordHash, now` | `void` | Сбрасывает `mustChangePassword`, обновляет `passwordChangedAt` |
| `PasswordPolicy.validate` | `plain: string, login: Login, current?: PasswordHash` | `Violation[]` | Пустой массив означает допустимый пароль |
| `AccessTokenService.sign / verify` | `AccessClaims` / `token: string` | `string` / `AccessClaims` | `verify` различает `Expired` и `Invalid` |

Ошибки домена: `InvalidCredentialsError`, `InvalidRefreshTokenError`, `RefreshRaceError`, `PasswordChangeRequiredError`, `WrongPasswordError`, `WeakPasswordError`, `SamePasswordError`. Их маппит существующий `HttpExceptionFilter` в 401, 403 (`PASSWORD_CHANGE_REQUIRED`), 409 (`REFRESH_RACE`) и 422.

Хранение: таблицы `auth_users`, `auth_sessions`, `auth_refresh_tokens` создаёт миграция `db/migrations/NNN_auth.sql`.

---

## Frontend — UI Model (расширение manager-helper)

### Pages (точки входа расширения)
| Page | Route | Структура | Назначение |
|---|---|---|---|
| `sidepanel` | `src/sidepanel/index.html` | существующий `App.tsx` оборачивается в `AuthGate` | Основной интерфейс; до входа показывает вход или смену пароля |
| `options` | `src/options/index.html` | существующий `App.tsx` + `AuthGate` | Настройки адреса бэкенда; при смене адреса запрос разрешений и сброс сессии |
| `background` | service worker | без UI, использует `authFetch` | Запросы фона получают тот же Bearer |

### Features (модули `src/shared/auth`, new)
| Feature | Статус | Публичный API (`index.ts`) | Содержимое | Назначение |
|---|---|---|---|---|
| `auth` | new | `authFetch`, `login`, `logout`, `changePassword`, `getAuthState`, `subscribeAuth`, типы | `auth-api.ts` (вызовы `/auth/*`), `access-token-store.ts` (токен в переменной), `refresh-coordinator.ts` (общий promise и `navigator.locks`), `auth-fetch.ts` (Bearer, 401 → refresh → повтор), `session-channel.ts` (`BroadcastChannel`) | Единый слой авторизации |
| `settings` | existing | без изменений API | `settings.ts` | `setBackendUrl` дополняется запросом `chrome.permissions` и сбросом сессии |
| `agent-client`, `threads-api` | existing | без изменений API | заменяют `fetch` на `authFetch` | Все вызовы бэкенда идут через общий слой |

### UI-компоненты
| Component | Расположение | Props | Назначение |
|---|---|---|---|
| `AuthGate` | `src/shared/auth/ui` | `children` | Отрисовывает `LoginForm`, `ChangePasswordDialog` или `children` по состоянию сессии |
| `LoginForm` | `src/shared/auth/ui` | `onSubmit`, `error`, `retryAfter` | Логин и пароль, блокировка при 429 |
| `ChangePasswordDialog` | `src/shared/auth/ui` | `onSubmit`, `onLogout`, `violations` | Обязательная смена пароля, не закрывается без выхода |
| `ConnectionError` | `src/shared/auth/ui` | `onRetry` | Сервер недоступен при восстановлении сессии |

Дизайн и тексты экранов: `ui-design.md` (следующий артефакт).

### Hooks
| Hook | Расположение | Тип | Возвращает |
|---|---|---|---|
| `useAuthSession` | `src/shared/auth/use-auth-session.ts` | state-хук над `subscribeAuth` | `{ status: 'restoring' \| 'anonymous' \| 'must-change-password' \| 'authenticated' \| 'offline', user, login, changePassword, logout }` |

### Паттерны
- [x] Публичный API только через `index.ts` модуля `auth`
- [x] Единая точка сетевых вызовов `authFetch`, остальной код `fetch` к бэкенду напрямую не вызывает
- [x] Ошибки API нормализуются в типизированные ошибки (`InvalidCredentials`, `RateLimited(retryAfter)`, `PasswordChangeRequired`)
- [ ] Mediator-компонент не требуется: один `AuthGate`
- [ ] Query options factory не применяется: в расширении нет TanStack Query для этого слоя

---

## Diagrams

### 1. Domain Entity Interaction
Состав агрегатов `User` и `AuthSession` (`RefreshToken[]`), связь по `userId`, VO.
Miro link: https://miro.com/app/board/uXjVERdgfao=/?moveToWidget=3458764689638451505

### 2. External Modules Interaction
Расширение (sidepanel, options, background) → `auth` → PostgreSQL; глобальные guard-ы `auth` → все остальные модули (`sheets-qa`, `price-policy-rag`, `audit-agent`); Redis для throttler; будущий Electron.
Miro link: https://miro.com/app/board/uXjVERdgfao=/?moveToWidget=3458764689638451506

### 3. Layer Interaction — от Controller до Response
Последовательность `refresh`: `OriginGuard` → `AuthController` → `RefreshSessionUseCase` → `AuthSessionRepository` (транзакция, блокировка) → `AuthSession.rotate` → `JwtAccessTokenService` → `RefreshCookieService` → ответ; ветки `Race` и `ReuseDetected`.
Miro link: https://miro.com/app/board/uXjVERdgfao=/?moveToWidget=3458764689638451507

---

## Confirmation Checklist
- [ ] Названия entity/aggregate/VO согласованы
- [ ] Названия и сигнатуры ключевых методов сервисов согласованы
- [ ] Структура фронтенда (`shared/auth`, `AuthGate`, хуки) согласована
- [ ] Диаграммы взаимодействия отражают ожидаемую реализацию
- [ ] Пользователь подтвердил переход к ui-design и tasks
