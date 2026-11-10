<!--
  Источники: proposal.md, design.md, architecture.md, ui-design.md.
  Дизайн: design/synergy-design-kit.pen. Читать макеты через mcp__pencil__execute / Get,
  в `filePath` передавать ОТНОСИТЕЛЬНЫЙ путь `design/synergy-design-kit.pen` (абсолютный путь с кириллицей даёт ошибки).
  Поведенческие референсы: спеки chat-sessions, agent-streaming-protocol, chat-thread-ui, chat-session-switcher
  и код manager-helper/src (threads-api.ts, agent-client.ts, sidepanel/*).
  Все команды выполняются в control-center/ (npm). Тесты: vitest + @testing-library/react.
-->

## 1. Подготовка проекта

- [x] 1.1 Добавить в `control-center` dev-зависимости для тестов (`vitest`, `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`), скрипт `test` (`vitest run`) и `vitest.config.ts` с двумя окружениями: `jsdom` для `src/renderer/**`, `node` для `src/main/**`; проверить: `npm test` запускается и сообщает «no tests» без ошибок конфигурации
- [x] 1.2 Добавить зависимости чата с точными версиями без `^`: `@ag-ui/client` 1.0.4, `@assistant-ui/react` 0.15.32, `@assistant-ui/react-ag-ui` 0.1.1 (как в `manager-helper`); проверить: `npm install` проходит, `npm run typecheck` зелёный
- [x] 1.3 Добавить shadcn-примитивы `components/ui/input.tsx` и `components/ui/skeleton.tsx` (стиль как у `button.tsx`; `Dialog` не нужен, см. `ui-design.md`); проверить: `npm run typecheck:web` зелёный. Тесты не заводим: примитивы без логики, обёртки над нативными элементами
- [x] 1.4 Создать пустые модули по `architecture.md`: `src/main/backend-config.ts`, `src/main/cc-api-protocol.ts`, `src/renderer/src/lib/backend/`, `features/chat-list/`, `features/chat/`, `layouts/`, `stores/chat.store.ts`; проверить: файлы на месте, `npm run typecheck` зелёный

## 2. Спайк: SSE через `cc-api://` (главный риск design.md)

- [x] 2.1 Поднять backend `sheets-qa` локально и написать одноразовый спайк в `src/main`: зарегистрировать схему `cc-api` (`registerSchemesAsPrivileged`: `supportFetchAPI`, `stream`, `corsEnabled`), обработать через `protocol.handle` + `net.fetch` (`duplex: 'half'`), выполнить из renderer `POST cc-api://backend/agent` с телом RunAgentInput; зафиксировать результат: события приходят по частям (не одним куском в конце), тело POST доходит, GET `/threads` отдаёт JSON
- [x] 2.2 По результату 2.1 принять решение: если стрим идёт частями и тело доходит, продолжать с решением 1 из `design.md`; если нет, остановить работу и согласовать с пользователем запасной IPC-транспорт (изменит группы 3, 4, 6); результат записать в `design.md` («Risks»)

## 3. Main: BackendConfig (TDD)

- [x] 3.1 Написать тесты `backend-config.test.ts` (окружение node): значение по умолчанию `http://localhost:3000`; чтение `CC_BACKEND_URL`; удаление завершающего `/`; ошибка на невалидный URL и на схему, отличную от http/https; убедиться, что тест-раннер видит тесты
- [x] 3.2 Прогнать тесты из 3.1 и зафиксировать, что они падают (red) — `getBackendUrl` ещё не реализован
- [x] 3.3 Реализовать `BackendConfig.getBackendUrl(): string` в `src/main/backend-config.ts`
- [x] 3.4 Прогнать тесты из 3.1 и зафиксировать, что они зелёные (green), регрессий нет

## 4. Main: CcApiProtocol (TDD)

- [x] 4.1 Написать тесты `cc-api-protocol.test.ts` на `forward(request, backendUrl)` с подменой `net.fetch`: переписывание `cc-api://backend/threads?x=1` в `<backendUrl>/threads?x=1`; проброс метода, заголовков и тела (`duplex: 'half'`) для POST; возврат потокового `Response` без буферизации (тело читается по частям); при сетевой ошибке ответ `502` с JSON `{message}`; запрос с хостом, отличным от `backend`, отклоняется `400`; убедиться, что тест-раннер видит тесты
- [x] 4.2 Прогнать тесты из 4.1 и зафиксировать, что они падают (red) — `forward` ещё не реализован
- [x] 4.3 Реализовать `CcApiProtocol.registerScheme()`, `install(backendUrl)`, `forward(request, backendUrl)` в `src/main/cc-api-protocol.ts`; подключить в `src/main/index.ts` (`registerScheme` до `app.whenReady`, `install(getBackendUrl())` после)
- [x] 4.4 Обновить CSP в `src/renderer/index.html`: добавить `connect-src cc-api:`; проверить, что `electron-vite dev` запускается и запрос `cc-api://backend/threads` из DevTools возвращает список чатов
- [x] 4.5 Прогнать тесты из 4.1 и зафиксировать, что они зелёные (green), регрессий нет

## 5. Renderer: клиент backend, ошибки и схемы (TDD)

- [x] 5.1 Написать тесты `lib/backend/client.test.ts` и `schema.test.ts`: `request` бросает `ThreadNotFoundError` на 404, `RunConflictError` на 409, `BackendError` с сообщением сервера на прочие non-2xx и «Не удалось связаться с сервером …» при сетевой ошибке; `ThreadSchema` и `ThreadHistorySchema` принимают корректные ответы и отвергают неполные (нет `id`/`title`/`lastActivityAt`); `titleIsCustom` и `running` по умолчанию `false`; убедиться, что тест-раннер видит тесты
- [x] 5.2 Прогнать тесты из 5.1 и зафиксировать, что они падают (red) — модули пустые
- [x] 5.3 Реализовать `lib/backend/errors.ts`, `schema.ts` (zod) и `client.ts` (`request(path, init)` на `cc-api://backend`)
- [x] 5.4 Прогнать тесты из 5.1 и зафиксировать, что они зелёные (green), регрессий нет

## 6. Renderer: API чатов и фабрика агента (TDD)

- [x] 6.1 Написать тесты `lib/backend/threads.api.test.ts` с моком `fetch`: `listThreads` (разбор массива, ошибка на неожиданный формат), `createThread(title?)` (POST, тело только при наличии названия), `getThreadHistory(id)`, `renameThread(id, title)` (PATCH), `deleteThread(id)` (DELETE), `cancelRun(id)` идемпотентна: 204 и 404 не ошибки; `createAgent(threadId)` создаёт `HttpAgent` с `url: 'cc-api://backend/agent'` и `threadId`; убедиться, что тест-раннер видит тесты
- [x] 6.2 Прогнать тесты из 6.1 и зафиксировать, что они падают (red) — функций ещё нет
- [x] 6.3 Реализовать `lib/backend/threads.api.ts` и `agent.ts`
- [x] 6.4 Прогнать тесты из 6.1 и зафиксировать, что они зелёные (green), регрессий нет

## 7. Renderer: chat.store (TDD)

- [x] 7.1 Написать тесты `stores/chat.store.test.ts`: `setActiveThread(id)` обновляет `activeThreadId`; значение сохраняется в `localStorage` и восстанавливается при создании стора; недоступный или битый `localStorage` не ломает стор (стартует с `null`); `setActiveThread(null)` сбрасывает; убедиться, что тест-раннер видит тесты
- [x] 7.2 Прогнать тесты из 7.1 и зафиксировать, что они падают (red)
- [x] 7.3 Реализовать `useChatStore` в `stores/chat.store.ts` (zustand; чтение и запись `localStorage` в try/catch)
- [x] 7.4 Прогнать тесты из 7.1 и зафиксировать, что они зелёные (green), регрессий нет

## 8. Feature chat-list: запросы и мутации (TDD)

- [x] 8.1 Написать тесты `features/chat-list/api.test.tsx` (QueryClientProvider, мок `threads.api`): `threadsQuery` с ключом `['threads']`; `useCreateThread` делает новый чат активным и инвалидирует `['threads']`; `useRenameThread` инвалидирует список; `useDeleteThread` для активного чата переключает на соседний из списка, а при пустом списке сбрасывает активный в `null`; удаление неактивного чата активный не меняет; ошибка 404 при удалении трактуется как успех (чат уже удалён) с инвалидацией; убедиться, что тест-раннер видит тесты
- [x] 8.2 Прогнать тесты из 8.1 и зафиксировать, что они падают (red)
- [x] 8.3 Реализовать `features/chat-list/api.ts` (`threadsQuery`, `useCreateThread`, `useRenameThread`, `useDeleteThread`)
- [x] 8.4 Прогнать тесты из 8.1 и зафиксировать, что они зелёные (green), регрессий нет

## 9. Feature chat-list: UI (по ui-design.md)

Макеты: файл `design/synergy-design-kit.pen`. Основной экран `WhlmQ` (боковая панель `vYLfd`), состояния `Qg2MW`. Перед вёрсткой прочитать фреймы через `mcp__pencil__execute` / `Get` и сверить итог со скриншотом.

- [x] 9.1 Написать тесты `ChatList.test.tsx` и `ChatListItem.test.tsx` (по `chat-session-switcher`): список сортируется как отдан backend (новые сверху), показаны название и время последней активности, активный чат выделен; состояние загрузки показывает скелетон; пустое состояние с кнопкой «Начать чат» создаёт чат; ошибка показывает сообщение и «Повторить» (повторный запрос списка); клик по чату вызывает `setActiveThread`; переименование: кнопка «Переименовать» открывает поле, Enter сохраняет, Esc отменяет, пустое или длиннее 120 символов блокируется; удаление: «Удалить» показывает подтверждение «Удалить чат вместе с историей? Это необратимо.», «Отмена» возвращает строку, «Удалить» вызывает мутацию; для чата с `running: true` в подтверждении есть предупреждение о том, что ответ будет прерван; убедиться, что тест-раннер видит тесты
- [x] 9.2 Прогнать тесты из 9.1 и зафиксировать, что они падают (red) — компонентов ещё нет
- [x] 9.3 Реализовать `ChatList`, `ChatListItem` (режимы normal / rename / confirmDelete), `RenameThreadInput`, `ChatListSkeleton`, публичный `features/chat-list/index.ts`; вёрстка по фреймам `vYLfd` (основной), `ez1lg` (загрузка), `vqYwp` (пусто), `Z25B4p` (ошибка), `BeDfy` (переименование и удаление: `H5ixsL`, `aXLJZ`)
- [x] 9.4 Прогнать тесты из 9.1 и зафиксировать, что они зелёные (green), регрессий нет
- [x] 9.5 Сверить реализованные состояния списка со скриншотами фреймов `vYLfd`, `ez1lg`, `vqYwp`, `Z25B4p`, `BeDfy` (запуск `electron-vite dev`, скриншоты окна) и зафиксировать расхождения или их отсутствие

## 10. Feature chat: история и отмена запуска (TDD)

- [x] 10.1 Написать тесты `use-thread-history.test.tsx` и `use-cancel-run.test.tsx`: `useThreadHistory(threadId)` возвращает `{messages, running}`, `isInitialLoad` только при первой загрузке, 404 даёт `ThreadNotFoundError` и сброс активного чата в `null`; при смене `threadId` история загружается для нового чата, ответ предыдущего не применяется (защита от устаревшего ответа, см. коммит 4393031 в `manager-helper`); `useCancelRun` вызывает `cancelRun`, 404 и 204 не ошибки; убедиться, что тест-раннер видит тесты
- [x] 10.2 Прогнать тесты из 10.1 и зафиксировать, что они падают (red)
- [x] 10.3 Реализовать `features/chat/use-thread-history.ts` и `use-cancel-run.ts`
- [x] 10.4 Прогнать тесты из 10.1 и зафиксировать, что они зелёные (green), регрессий нет

## 11. Feature chat: диалог (TDD + UI по ui-design.md)

Макеты: основной экран `WhlmQ` (область диалога `oSqDs`), состояния `Qg2MW`. Перед вёрсткой прочитать фреймы через `mcp__pencil__execute` / `Get`, итог сверить со скриншотом.

- [x] 11.1 Написать тесты `ChatRuntimeProvider.test.tsx`, `ChatThread.test.tsx`, `Composer.test.tsx` (по `chat-thread-ui` и `agent-streaming-protocol`): история отображается в хронологическом порядке (вопрос, ответ); ответ агента растёт по мере событий AG-UI (мок `HttpAgent`), во время ответа виден индикатор «Агент отвечает…»; по завершении запуска индикатор пропадает, поле ввода доступно; «Остановить» вызывает `cancelRun`, текст ответа остаётся; ошибка сети показывает уведомление «Не удалось связаться с сервером …» с «Повторить»; 409 показывает «Агент ещё отвечает» и не теряет черновик; пустое сообщение не отправляется; черновик не теряется при ошибке и завершении запуска; нет активного чата: экран «Выберите чат»; новый чат: подсказка и пустая история; убедиться, что тест-раннер видит тесты
- [x] 11.2 Прогнать тесты из 11.1 и зафиксировать, что они падают (red)
- [x] 11.3 Реализовать `ChatRuntimeProvider` (`HttpAgent` + `assistant-ui` runtime, `threadId` как идентификатор чата), `ChatThread`, `Composer`, `UserMessage`, `AssistantMessage`, публичный `features/chat/index.ts`; вёрстка по фреймам `oSqDs` (основной), `yNlOb` (новый чат), `h8cW08` (чат не выбран), `GD6UB` (остановлен, `Run Notice`), `NLifk` (ошибка и 409, `Run Notice`); использовать `Button` и `Field` как в макете
- [x] 11.4 Прогнать тесты из 11.1 и зафиксировать, что они зелёные (green), регрессий нет
- [x] 11.5 Сверить состояния диалога со скриншотами фреймов `oSqDs`, `yNlOb`, `h8cW08`, `GD6UB`, `NLifk` (запуск `electron-vite dev`, скриншоты окна) и зафиксировать расхождения или их отсутствие

## 12. Сборка экрана

- [x] 12.1 Написать тест `App.test.tsx`: `App` рендерит `ChatLayout` с `ChatList` в слоте `sidebar` и `ChatThread` в слоте `main`; выбор чата в списке показывает его историю в диалоге; удаление активного чата возвращает диалог к «Выберите чат» или к соседнему чату; убедиться, что тест-раннер видит тест
- [x] 12.2 Прогнать тест из 12.1 и зафиксировать, что он падает (red) — `ChatLayout` ещё нет
- [x] 12.3 Реализовать `layouts/ChatLayout.tsx` (слоты `sidebar` и `main`, раскладка по фрейму `WhlmQ`) и заменить демо-таблицу `items` в `App.tsx` экраном чата; обернуть приложение в `QueryClientProvider`, если ещё не обёрнуто
- [x] 12.4 Прогнать тесты из 12.1 и всего пакета (`npm test`) и зафиксировать, что они зелёные (green); дополнительно `npm run typecheck` без ошибок

## 13. Интеграционная проверка

- [ ] 13.1 (выполнено на mock-сервере; на реальном `sheets-qa` не пройдено: он отвечает 401 TOKEN_INVALID, авторизация во втором заходе, а `/agent` требует LLM) Запустить backend `sheets-qa` и `electron-vite dev` (скилл `run`) и пройти сценарий: список чатов загружается; создание нового чата; вопрос агенту, ответ приходит потоково; остановка ответа; переключение между чатами с подгрузкой истории; переименование; удаление неактивного и активного чата; удаление чата с идущим ответом; перезапуск приложения восстанавливает последний активный чат; результат (скриншоты, заметки) приложить к задаче
- [x] 13.2 Проверить ошибочные сценарии: остановленный backend (список показывает ошибку и «Повторить», диалог показывает уведомление), неверный `CC_BACKEND_URL`, повторный вопрос в чат с активным запуском (409), удаление чата в другом окне (404 при открытии); результат зафиксировать
- [x] 13.3 Выполнить `npm run build` в `control-center` и проверить в собранном приложении (`electron-vite preview`), что работает `cc-api://` и стриминг ответа при загрузке renderer с `file://`

## 14. Code review

- [x] 14.1 Запустить code-review (скилл `code-review`) по всем изменениям фичи - от коммита, с которого начат change, до текущего HEAD: соответствие стандартам проекта и specs этого change
- [ ] 14.2 (замечания исправлены, тесты зелёные; коммит не сделан, ждёт решения пользователя) Исправить замечания ревью (блокирующие и существенные обязательно; остальные - исправить или явно отклонить с обоснованием), результат зафиксировать коммитом
- [x] 14.3 Повторить code-review по правкам из 14.2 и убедиться, что блокирующих замечаний нет; прогнать тесты и зафиксировать, что они зелёные
