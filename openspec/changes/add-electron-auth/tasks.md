## 1. Main: доменные value objects (TDD)

Каталог `control-center/src/main/auth/domain`. Тесты: vitest, проект `main` (`src/main/**/*.test.ts`), запуск `npm test` в `control-center/`.

- [x] 1.1 Написать тесты на `AccessToken` (разбор `exp` из JWT, `expiresWithin(ms)`, битый токен отклоняется), `RefreshToken` (значение скрыто в `toString()`/`JSON.stringify`), `SessionState` (допустимые переходы `restoring → authenticated | mustChangePassword | unauthenticated | connectionError`, `connectionError → restoring`, недопустимый переход отклоняется), `AuthError` (коды и `retryAfterSec`) и убедиться, что раннер их видит
- [x] 1.2 Прогнать тесты из 1.1: red (классов нет)
- [x] 1.3 Реализовать `AccessToken`, `RefreshToken`, `SessionState`, `SessionUser`, `AuthError`, тип `SessionSnapshot` (`{ state, user, warning?, retryAfterSec? }`, без токенов)
- [x] 1.4 Прогнать тесты из 1.1: зелёные, регрессий в `npm test` нет

## 2. Main: TokenVault на safeStorage (TDD)

- [x] 2.1 Написать тесты `TokenVault` с моком `safeStorage` и временным каталогом: `save` шифрует и пишет файл в `userData`, возвращает `{ persisted: true }`; `load` расшифровывает и возвращает `RefreshToken`; повреждённый файл или ошибка расшифровки даёт `null` и удаляет файл; `clear` идемпотентен; при `isEncryptionAvailable() === false` или backend `basic_text` файл не создаётся, `save` возвращает `{ persisted: false }` (spec «Шифрование недоступно»); в файле нет открытого токена. Раннер их видит
- [x] 2.2 Прогнать тесты из 2.1: red
- [x] 2.3 Реализовать `TokenVault` в `main/auth/infrastructure/token-vault.ts`
- [x] 2.4 Прогнать тесты из 2.1: зелёные, регрессий нет

## 3. Main: AuthApiClient (TDD)

- [x] 3.1 Написать тесты `AuthApiClient` с моком `net.fetch`: `login`, `refresh`, `logout`, `changePassword` идут на `/auth/*` с `X-Client-Type: desktop`, без `Cookie`, refresh-токен уходит в теле; `login`/`refresh`/`logout` без `Authorization`, `changePassword` с Bearer; маппинг ответов: 401 `TOKEN_EXPIRED`/`TOKEN_INVALID`, 401 неверные данные → `INVALID_CREDENTIALS`, 403 `PASSWORD_CHANGE_REQUIRED`, 409 `REFRESH_RACE`, 429 с `Retry-After` → `RATE_LIMITED` + `retryAfterSec`, сетевая ошибка → `NETWORK`. Раннер их видит
- [x] 3.2 Прогнать тесты из 3.1: red
- [x] 3.3 Реализовать `AuthApiClient` в `main/auth/infrastructure/auth-api-client.ts` (тела ответов не попадают в `AuthError`)
- [x] 3.4 Прогнать тесты из 3.1: зелёные, регрессий нет

## 4. Main: AuthService (TDD)

- [x] 4.1 Написать тесты `AuthService` с фейками `AuthApiClient`/`TokenVault` по `specs/desktop-auth-session`: `login` (успех → `authenticated`, access в памяти, refresh в vault; `mustChangePassword` → состояние `mustChangePassword`; 401 и 429 пробрасываются как `AuthError`); `restore` (токена нет → `unauthenticated`; успех → `authenticated`; 401 → vault очищен, `unauthenticated`; сетевая ошибка → `connectionError`, vault не тронут); `refresh` (три параллельных вызова дают один запрос; 409 `REFRESH_RACE` → один повтор с токеном из vault; 401 → токены стёрты, `unauthenticated`; новый refresh записан в vault до публикации нового access); `getAccessToken(minTtlMs)` (проактивное обновление при `exp` < 30 с); `changePassword` (новая пара сохраняется, состояние `authenticated`); `logout` (сервер доступен → `serverRevoked: true`; сервер недоступен → токены стёрты, `serverRevoked: false`, `warning` в снимке); `onChange` и отписка; переход в `unauthenticated` вызывает отмену общего `AbortSignal` сессии. Раннер их видит
- [x] 4.2 Прогнать тесты из 4.1: red
- [x] 4.3 Реализовать `AuthService` в `main/auth/application/auth-service.ts` по сигнатурам из `architecture.md` (`restore`, `login`, `changePassword`, `logout`, `refresh`, `getAccessToken`, `getSnapshot`, `onChange`, `sessionSignal`)
- [x] 4.4 Прогнать тесты из 4.1: зелёные, регрессий нет

## 5. Main: CcApiProxy с авторизацией (TDD)

- [x] 5.1 Расширить `cc-api-protocol.test.ts` (и добавить тесты на новую логику): добавляется `Authorization: Bearer <access>` из `AuthService.getAccessToken(30_000)`; заголовки `authorization`, `cookie`, `x-client-type` от renderer отбрасываются; `/auth/*` через прокси по-прежнему 403; при 401 `TOKEN_EXPIRED` один `refresh()` и один повтор запроса с буферизованным телом; повтор не выполняется второй раз; 401 после неудачного refresh возвращается renderer-у; 403 `PASSWORD_CHANGE_REQUIRED` передаётся как есть; ответ `/agent` отдаётся потоком без буферизации; при отмене `sessionSignal` активные запросы прерываются. Раннер их видит
- [x] 5.2 Прогнать тесты из 5.1: red по новым сценариям, старые тесты зелёные
- [x] 5.3 Реализовать авторизацию, повтор и отмену в `cc-api-protocol.ts`, сигнатура `forward(request, backendUrl, auth)` и `install(backendUrl, auth)`
- [x] 5.4 Прогнать тесты из 5.1: зелёные, регрессий нет

## 6. Main и preload: IPC (TDD)

- [x] 6.1 Написать тесты `AuthIpc` (`main/auth/interface/auth-ipc.ts`) с фейковым `ipcMain` и `AuthService`: каналы `auth:login`, `auth:logout`, `auth:changePassword`, `auth:retryRestore`, `auth:getState`; валидация входных данных (не строки, пустой логин, слишком длинные значения отклоняются); в ответах и событиях `session:changed` нет токенов (проверка по сериализации снимка); событие рассылается всем окнам. Тесты на preload: `window.api.auth` содержит только перечисленные методы и `onSessionChanged`, `ipcRenderer` целиком не выставляется. Раннер их видит
- [x] 6.2 Прогнать тесты из 6.1: red
- [x] 6.3 Реализовать `AuthIpc` и расширить `preload/index.ts` (`api.auth.{login, logout, changePassword, retryRestore, getState, onSessionChanged}`), обновить `Api`-тип; `platform` сохраняется
- [x] 6.4 Прогнать тесты из 6.1: зелёные, регрессий нет

## 7. Main: сборка и интеграционная проверка прокси (TDD)

- [x] 7.1 Написать интеграционный тест в `src/main` на локальном `http`-сервере вместо backend: login → запрос `/threads` с Bearer; три параллельных запроса с истёкшим токеном дают ровно один `/auth/refresh` и три повтора (spec «Несколько запросов одновременно»); стрим `/agent` приходит чанками; `/agent` повторяется после 401 только один раз. Раннер его видит
- [x] 7.2 Прогнать тест из 7.1: red
- [x] 7.3 В `main/index.ts` собрать `TokenVault`, `AuthApiClient`, `AuthService`, `AuthIpc`, передать `AuthService` в `installCcApi`, вызвать `restore()` после создания окна; включить `session:changed` для новых окон
- [x] 7.4 Прогнать тест из 7.1 и весь `npm test`, `npm run typecheck` в `control-center/`: зелёные

## 8. Renderer: состояние сессии и хуки (TDD)

Каталог `control-center/src/renderer/src/features/auth`.

- [x] 8.1 Написать тесты (`window.api.auth` подменяется моком) на `session.store.ts` и `useSession` (начальное `getState`, обновление по `onSessionChanged`, отписка при размонтировании), `useLogin` (успех, `INVALID_CREDENTIALS`, `RATE_LIMITED` с `retryAfterSec`), `useChangePassword` (проверки на клиенте: подтверждение не совпадает и «новый равен текущему» не вызывают IPC), `useLogout` (возвращает `serverRevoked`), `session-reset.ts` (при переходе в `unauthenticated` очищаются кэш TanStack Query и Zustand-сторы чатов `chat.store`, `ui.store`). Раннер их видит
- [x] 8.2 Прогнать тесты из 8.1: red
- [x] 8.3 Реализовать `auth.api.ts`, `session.store.ts`, `use-session.ts`, `use-login.ts`, `use-change-password.ts`, `use-logout.ts`, `session-reset.ts`
- [x] 8.4 Прогнать тесты из 8.1: зелёные, регрессий нет

## 9. Renderer: экран входа (по ui-design.md)

Макеты читать через `mcp__pencil__execute` (`Get`) в `design/synergy-design-kit.pen`; сверять со скриншотом (`TakeScreenshot`). Компоненты: существующий UI renderer (`components/ui`), токены из `src/renderer/src/index.css`.

- [x] 9.1 Написать тесты `LoginForm`: рендер пустой формы; отправка вызывает `onSubmit(login, password)`; кнопка недоступна при пустых полях и при отправке; ошибка «Неверный логин или пароль» под полем пароля; при `retryAfterSec` форма заблокирована, на кнопке обратный отсчёт, после нуля разблокируется (fake timers); `warning` показывается над формой. Раннер их видит
- [x] 9.2 Прогнать тесты из 9.1: red
- [x] 9.3 Реализовать `LoginForm` по фреймам `P2dHR` (полный макет), `rti7r` (неверный пароль), `MbozZ` (429), `ojeRw` (предупреждение после выхода без связи)
- [x] 9.4 Прогнать тесты из 9.1: зелёные; сверить рендер со скриншотами фреймов

## 10. Renderer: смена пароля, подключение, восстановление (по ui-design.md)

- [x] 10.1 Написать тесты `ChangePasswordDialog`: три поля и кнопки «Сменить пароль» и «Выйти»; закрыть окно по Escape, клику по подложке и крестику нельзя; ошибки «Пароли не совпадают» и «Новый пароль должен отличаться от текущего» показываются под полем без вызова `onSubmit`; «Выйти» вызывает `onLogout`. Тесты `ConnectionError` (кнопка «Повторить» вызывает `onRetry`). Раннер их видит
- [x] 10.2 Прогнать тесты из 10.1: red
- [x] 10.3 Реализовать `ChangePasswordDialog` по фреймам `KxdBI` (по умолчанию) и `jdHdg` (ошибка), `ConnectionError` по `d2Lp09`. Исключение из TDD: `RestoringScreen` (`CfB8w`) без ветвлений и данных, это статичная вёрстка (спиннер и подпись), отдельные тесты не нужны, покрывается тестом `AuthGate`
- [x] 10.4 Прогнать тесты из 10.1: зелёные; сверить рендер со скриншотами фреймов

## 11. Renderer: AuthGate и выход (TDD)

- [x] 11.1 Написать тесты `AuthGate`: `restoring` → `RestoringScreen`; `unauthenticated` → `LoginForm`, дочернее содержимое (чаты) не рендерится (spec «Первый запуск»); `mustChangePassword` → `ChangePasswordDialog`, дочернее содержимое недоступно; `connectionError` → `ConnectionError`; `authenticated` → дочернее содержимое. Тесты `LogoutButton` в `ChatLayout`: клик вызывает `useLogout`, при `serverRevoked: false` следующий экран входа получает `warning`. Тест на потерю сессии: при `unauthenticated` во время идущего ответа агента запрос прерывается и показывается экран входа (spec «Потеря сессии во время ответа»). Раннер их видит
- [x] 11.2 Прогнать тесты из 11.1: red
- [x] 11.3 Реализовать `AuthGate` и `index.ts` фичи, обернуть `ChatLayout` в `App.tsx`, добавить подвал боковой панели с логином и кнопкой «Выйти» по фрейму `nDlJr`, подключить `session-reset` к смене состояния
- [x] 11.4 Прогнать тесты из 11.1 и весь `npm test`, `npm run typecheck` в `control-center/`: зелёные

## 12. Сквозная проверка

- [ ] 12.1 Запустить приложение против локального backend (скилл `run`, `CC_BACKEND_URL`), пройти: первый запуск без токена (экран входа, чаты недоступны) → вход временным паролем (окно смены) → смена пароля → чат работает → перезапуск (сессия восстановлена без пароля) → выход (экран входа, чаты предыдущего пользователя не видны). Сделать скриншоты ключевых состояний
- [ ] 12.2 Проверить отказоустойчивость: остановить backend и перезапустить приложение (экран «Нет связи с сервером», токен на диске сохранён, «Повторить» после запуска backend восстанавливает сессию); выход без связи (предупреждение на экране входа, токены стёрты); убедиться, что в `userData` нет открытого refresh-токена и в DevTools renderer нет доступа к токенам (`window.api` содержит только перечисленные методы)

## 13. Code review

- [ ] 13.1 Запустить code-review (скилл `code-review`) по всем изменениям фичи - от коммита, с которого начат change, до текущего HEAD: соответствие стандартам проекта и specs этого change
- [ ] 13.2 Исправить замечания ревью (блокирующие и существенные обязательно; остальные - исправить или явно отклонить с обоснованием), результат зафиксировать коммитом
- [ ] 13.3 Повторить code-review по правкам из 13.2 и убедиться, что блокирующих замечаний нет; прогнать тесты и зафиксировать, что они зелёные
