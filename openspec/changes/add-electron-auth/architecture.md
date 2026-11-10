# Architecture: add-electron-auth

## Scope

Клиентская авторизация в Electron-приложении control-center: токены и вызовы `/auth/*` живут в процессе main (`AuthService`, `TokenVault`), прокси `cc-api` подставляет `Authorization`, renderer получает только состояние сессии через узкий IPC. Backend не меняется; серверная доменная модель (`user-auth`) остаётся как есть.

> Примечание. «Backend — Domain Model» здесь описывает доменный слой процесса main, потому что токены не должны попадать в renderer. `frontend/CLAUDE.md` в репозитории нет, а renderer control-center не использует FSD (структура `features/`, `lib/`, `stores/`, `layouts/`), поэтому раздел Frontend опирается на фактическую структуру `control-center/src/renderer/src`.

---

## Backend — Domain Model (процесс main)

### Entities
| Name | Status | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `Session` | new | да | `accessToken: string \| null`, `accessExp: number \| null`, `refreshToken: string \| null`, `state: SessionState`, `user: SessionUser \| null` | Текущая сессия пользователя. Единственная точка, меняющая состояние авторизации. |
| `PersistedRefreshToken` | new | нет | `ciphertext: Buffer`, `savedAt: number` | Зашифрованный refresh-токен на диске (`userData`). |

### Aggregates
| Aggregate | Root entity | Входит в состав (entities/VO) | Инварианты, которые защищает |
|---|---|---|---|
| `Session` | `Session` | `AccessToken`, `RefreshToken`, `SessionState`, `SessionUser` | Токены в renderer не покидают main. Одновременно идёт не более одного refresh. Новый refresh-токен записывается в хранилище до публикации нового access. `unauthenticated` ⇒ в памяти и на диске токенов нет. |

### Value Objects
| Name | Поля | Почему VO (immutable/self-validating) |
|---|---|---|
| `AccessToken` | `value: string`, `exp: number` | `exp` разбирается из JWT при создании; `expiresWithin(ms)` не зависит от внешнего состояния. |
| `RefreshToken` | `value: string` | Непрозрачная строка; `toString()` скрыт для логов (`[redacted]`). |
| `SessionState` | `'restoring' \| 'authenticated' \| 'mustChangePassword' \| 'unauthenticated' \| 'connectionError'` | Закрытое множество состояний; допустимые переходы проверяются в одном месте. |
| `SessionUser` | `id`, `login` | Публичные данные пользователя, безопасные для передачи в renderer. |
| `AuthError` | `code: 'INVALID_CREDENTIALS' \| 'RATE_LIMITED' \| 'PASSWORD_CHANGE_REQUIRED' \| 'TOKEN_EXPIRED' \| 'TOKEN_INVALID' \| 'REFRESH_RACE' \| 'WRONG_PASSWORD' \| 'SAME_PASSWORD' \| 'WEAK_PASSWORD' \| 'NETWORK' \| 'SERVER_ERROR'`, `retryAfterSec?: number` | Нормализованная ошибка backend; отдаётся в renderer без тел ответов. |

### Services
| Service | Слой | Ответственность |
|---|---|---|
| `AuthService` | application | Сценарии `login`, `logout`, `changePassword`, `restore`, `refresh`, `getAccessToken`. Владеет `Session`, публикует `SessionState`, держит единый «полёт» refresh. |
| `AuthApiClient` | infrastructure | HTTP к `/auth/*` через `net.fetch` с `X-Client-Type: desktop`; маппинг ответов в `AuthError`. |
| `TokenVault` | infrastructure | Запись и чтение refresh-токена через `safeStorage` в файл `userData`. При недоступном шифровании (в том числе `basic_text` на Linux) ничего не пишет. |
| `CcApiProxy` (`cc-api-protocol.ts`) | infrastructure | Подстановка `Authorization`, проактивный и реактивный refresh, повтор запроса один раз, прерывание запросов при потере сессии. |
| `AuthIpc` (`auth-ipc.ts`) | infrastructure | Регистрация `ipcMain.handle`, валидация входных данных, публикация `session:changed` в окна. |

### Method Signatures (ключевые, по каждому сервису)
| Service.Method | Params | Returns | Краткое описание |
|---|---|---|---|
| `AuthService.restore` | — | `Promise<void>` | При запуске читает токен из `TokenVault`, делает `refresh`; `restoring` → `authenticated` / `unauthenticated` / `connectionError`. |
| `AuthService.login` | `login: string, password: string` | `Promise<SessionSnapshot>` | `POST /auth/login`; сохраняет токены; `mustChangePassword` → состояние `mustChangePassword`. Бросает `AuthError`. |
| `AuthService.changePassword` | `current: string, next: string` | `Promise<SessionSnapshot>` | `POST /auth/change-password` с Bearer; после успеха сохраняет новую пару токенов. |
| `AuthService.logout` | — | `Promise<{ serverRevoked: boolean }>` | Отзыв на сервере, очистка памяти и диска даже при сетевой ошибке. |
| `AuthService.refresh` | — | `Promise<AccessToken>` | Единый refresh; 409 `REFRESH_RACE` — один повтор с токеном из `TokenVault`; 401 `TOKEN_INVALID` — `unauthenticated`. |
| `AuthService.getAccessToken` | `minTtlMs?: number` | `Promise<string \| null>` | Возвращает токен; если до `exp` меньше `minTtlMs` (30 с), сначала `refresh`. |
| `AuthService.getSnapshot` | — | `SessionSnapshot` | `{ state, user, warning?, retryAfterSec? }` без токенов. |
| `AuthService.onChange` | `listener: (s: SessionSnapshot) => void` | `() => void` | Подписка на изменения состояния. |
| `AuthApiClient.login/refresh/logout/changePassword` | DTO запросов | DTO ответов или `AuthError` | Тонкие обёртки над `/auth/*`. |
| `AuthApiClient.getCurrentUser` | `access: AccessToken` | `SessionUser` | `GET /auth/me`: ответ `login` не содержит пользователя, а JWT несёт только `sub`/`sid`, поэтому логин для интерфейса берётся отсюда. |
| `TokenVault.save` | `token: RefreshToken` | `{ persisted: boolean }` | `persisted: false`, если шифрование недоступно. |
| `TokenVault.load / clear` | — | `RefreshToken \| null` / `void` | Чтение (с расшифровкой) и удаление файла. |
| `CcApiProxy.forward` | `request: Request, backendUrl: string, auth: AuthService` | `Promise<Response>` | Фильтр заголовков, Bearer, один повтор при 401 `TOKEN_EXPIRED`, `AbortSignal` сессии. |

---

## Frontend — UI Model (renderer)

### Pages
| Page | Route | Структура | Назначение |
|---|---|---|---|
| — | — | Роутинга нет; вход в приложение через `App.tsx` | Экран входа и диалоги показывает `AuthGate`, оборачивающий `ChatLayout`. |

### Features (переиспользуемые модули с бизнес-логикой)
| Feature | Статус | Публичный API (index.ts) | model/ (хуки, api.ts) | Назначение |
|---|---|---|---|---|
| `features/auth` | new | `AuthGate`, `useSession`, `useLogout` | `session.store.ts`, `use-session.ts`, `auth.api.ts` (обёртка над `window.api.auth`), `session-reset.ts` | Состояние сессии, экраны входа и смены пароля, сброс данных пользователя. |
| `features/chat`, `features/chat-list` | existing | без изменений | `lib/backend/client.ts` | Реакция на потерю сессии (401 после refresh) без собственной логики токенов. |

### UI-компоненты (page-local и shared)
| Component | Слой | Props (основные) | Назначение |
|---|---|---|---|
| `AuthGate` | `features/auth` | `children` | По `SessionState` рисует `RestoringScreen`, `LoginForm`, `ChangePasswordDialog`, `ConnectionError` или приложение. |
| `LoginForm` | `features/auth` | `onSubmit`, `error`, `retryAfterSec` | Логин и пароль, блокировка при 429. |
| `ChangePasswordDialog` | `features/auth` | `onSubmit`, `onLogout`, `error` | Модальное окно без закрытия: смена пароля или выход. |
| `ConnectionError` | `features/auth` | `onRetry` | Ошибка подключения при восстановлении. |
| `RestoringScreen` | `features/auth` | — | Индикатор при `restoring`. |
| `LogoutButton` | `layouts/ChatLayout` | `onLogout`, `warning` | Выход и предупреждение при недоступном сервере. |

### Hooks (model)
| Hook | Расположение | Тип | Возвращает |
|---|---|---|---|
| `useSession` | `features/auth/model/use-session.ts` | state-хук (подписка `session:changed`) | `{ state, user, warning, retryAfterSec }` |
| `useLogin` | `features/auth/model/use-login.ts` | mutation | `mutate(login, password)`, ошибка как `AuthError` |
| `useChangePassword` | `features/auth/model/use-change-password.ts` | mutation | `mutate(current, next)` |
| `useLogout` | `features/auth/model/use-logout.ts` | mutation | `mutate()`, `serverRevoked` |

### Паттерны, которые нужно учесть при проектировании
- [x] Публичный API фичи только через `index.ts`
- [x] Запросы к backend через общий `client.ts`; вызовы `/auth/*` в renderer отсутствуют, только IPC
- [x] Ошибки нормализуются в `AuthError` в main, в renderer приходит только `code` и `retryAfterSec`
- [x] Mediator-компонент (в renderer нет страниц)
- [x] Слоты вместо `children` для layout — не нужны, `AuthGate` — единственный контейнер
- [x] `isInitialLoad` / `isRefreshing` — не применимо
- [x] Новые UI-компоненты используют существующий UI-кит renderer (`components/ui`), shadcn-легаси в этом приложении нет

---

## Diagrams

### 1. Domain Entity Interaction
Miro link: https://miro.com/app/board/uXjVEQS7mR4=/?moveToWidget=3458764689853912770

### 2. External Modules Interaction
Miro link: https://miro.com/app/board/uXjVEQS7mR4=/?moveToWidget=3458764689853912769

### 3. Layer Interaction — от Controller до Response
Miro link: https://miro.com/app/board/uXjVEQS7mR4=/?moveToWidget=3458764689853912767

---

## Confirmation Checklist
- [x] Названия entity/aggregate/VO согласованы
- [x] Названия и сигнатуры ключевых методов сервисов согласованы
- [x] Слои (features/lib/stores/layouts renderer, main), структура model/ui и паттерны фронта согласованы
- [x] Диаграммы взаимодействия отражают ожидаемую реализацию
- [x] Пользователь подтвердил переход к tasks.md
