## Допущения

- Открытые вопросы из design.md не меняют состав задач и решены так: вызовы субагентов показываются плоским списком (как в `ui-design.md`); пометка «ответ прерван перезапуском сервера» не делается (вопрос остаётся без ответа, пользователь повторяет его).
- Отклонения из `ui-design.md` (кнопка «Остановить» в композере; уведомление «Ответ остановлен» как вариант `Run Notice`) согласованы с пользователем перед этим артефактом.
- Тесты: backend и `manager-helper` используют `vitest` (`npm test` в каждом пакете). Проверки: `npm run typecheck`, `npm run lint` (backend и расширение), `npm run build`.
- Дизайн: файл `design/synergy-design-kit.pen`; читать только через `mcp__pencil__execute` с `filePath: "design/synergy-design-kit.pen"` (относительный путь; абсолютный с кириллицей Pencil не принимает) и `Get`. Экран `GHRO6`, UI Kit `k9JASi`.
- Базовый коммит change для code review: `87e81a3`.

## 1. Подготовка и проверка стыков

- [x] 1.1 Добавить в backend `@ag-ui/core` и `@ag-ui/encoder` (точные версии) и убедиться, что `npm install`, `npm run typecheck` проходят
- [x] 1.2 Добавить в `manager-helper` `@ag-ui/client`, `@assistant-ui/react`, `@assistant-ui/react-ag-ui` (точные версии, без `^`) и убедиться, что `npm run build` проходит и размер бандла side panel зафиксирован в заметке к задаче
- [x] 1.3 Прототип событий LangGraph: скриптом на фейковой модели вызвать `createDeepAgent(...).streamEvents(..., {version: 'v2'})` с одним инструментом и одним субагентом, сохранить записанный поток как фикстуру `backend/src/modules/sheets-qa/infrastructure/testing/stream-events.fixture.json`; в заметке перечислить, какие типы событий несут текстовые фрагменты, начало и конец вызова инструмента и события субагентов
- [x] 1.4 Прототип клиента: поднять заглушку `POST /agent` (SSE с `RUN_STARTED`, `TEXT_MESSAGE_*`, `RUN_FINISHED`), подключить `HttpAgent` из side panel расширения и убедиться, что поток доходит (CORS, `Accept: text/event-stream`); результат и нужные CORS-настройки записать в заметку, при необходимости обновить `design.md` (раздел Risks)

## 2. Домен: AgentRun, RunInput, AgentEvent (TDD)

- [x] 2.1 Написать тесты в `domain/` (по architecture.md): `RunInput` (обрезает вопрос, отклоняет пустой и длиннее `MAX_QUESTION_LENGTH`, пустой `threadId`); `AgentRun` (старт в `running`, один переход в `finished`/`failed`/`cancelled`, повторный переход отклоняется, `cancel()` вызывает `abort` у `signal`); `AgentEvent` (конструкторы и типы вариантов)
- [x] 2.2 Прогнать тесты из 2.1 и зафиксировать, что они падают (red): модулей `run-input`, `agent-run`, `agent-event` ещё нет
- [x] 2.3 Реализовать `RunInput`, `AgentRun`, `AgentEvent` и `RunConflictError` в `backend/src/modules/sheets-qa/domain/`
- [x] 2.4 Прогнать тесты из 2.1 и зафиксировать, что они зелёные (green), регрессий в соседних тестах модуля нет

## 3. Реестр активных запусков (TDD)

- [x] 3.1 Написать тесты `InMemoryActiveRunRegistry` (по specs «Один активный запуск на чат», «Явная отмена»): `tryStart` возвращает запуск, второй `tryStart` того же `threadId` — `null`, другого — запуск; `isRunning`; `cancel` абортит сигнал и идемпотентен для чата без запуска; `release(threadId, runId)` удаляет только при совпадении `runId`; после `release` новый `tryStart` проходит
- [x] 3.2 Прогнать тесты из 3.1 и зафиксировать, что они падают (red): порта и реализации нет
- [x] 3.3 Добавить `ActiveRunRegistryPort` в `domain/ports/` и реализацию `InMemoryActiveRunRegistry` в `infrastructure/`
- [x] 3.4 Прогнать тесты из 3.1 и зафиксировать, что они зелёные (green), регрессий нет

## 4. Перевод событий LangGraph в AgentEvent (TDD)

- [x] 4.1 Написать тесты чистого преобразователя `mapStreamEvent` на фикстуре из 1.3 (по specs «Потоковая выдача ответа», «Прозрачность вызовов инструментов»): текстовые фрагменты верхнеуровневого агента → `text-delta`; начало и конец вызова инструмента → `tool-call-started`/`tool-call-finished` с `callId`, именем и аргументами; вызовы субагентов попадают в поток; склейка `text-delta` равна итоговому ответу; событие с результатом инструмента не попадает наружу как текст
- [x] 4.2 Прогнать тесты из 4.1 и зафиксировать, что они падают (red): преобразователя нет
- [x] 4.3 Реализовать `mapStreamEvent` (и сбор итогового `run-finished` с `answer`, `toolCalls`, `durationMs`) в `infrastructure/`
- [x] 4.4 Прогнать тесты из 4.1 и зафиксировать, что они зелёные (green), регрессий в `collect-tool-calls.spec.ts` и соседних тестах нет

## 5. DeepAgentsSheetsAssistant.stream (TDD)

- [x] 5.1 Написать тесты `DeepAgentsSheetsAssistant.stream` на фейковой модели (по specs «Завершение и ошибки запуска», «Запуск не зависит от соединения»): успешный поток заканчивается `run-finished`; ошибка модели → `run-failed` с текстом; abort-сигнал → `run-cancelled` и остановка; таймаут → `run-failed` с указанием на превышение времени; превышение `recursionLimit` → `run-failed`; `thread_id` равен `threadId`
- [x] 5.2 Прогнать тесты из 5.1 и зафиксировать, что они падают (red): метода `stream` ещё нет
- [x] 5.3 Заменить `SheetsAssistantPort.ask` на `stream(input, signal): AsyncIterable<AgentEvent>`; реализовать в `DeepAgentsSheetsAssistant` через `agent.streamEvents(..., {version: 'v2', recursionLimit, signal, configurable: {thread_id}})` и `mapStreamEvent`; перенести лимиты шагов и таймаут; prompt caching и скрытие данных не менять
- [x] 5.4 Прогнать тесты из 5.1 и зафиксировать, что они зелёные (green), регрессий в `sheets-qa-subagents.spec.ts` и остальных тестах модуля нет

## 6. StartAgentRunUseCase (TDD)

- [x] 6.1 Написать тесты `StartAgentRunUseCase.execute` на фейковых портах (по specs `agent-streaming-protocol` и `chat-sessions`): пустой и слишком длинный вопрос → `InvalidQuestionError`, ничего не пишется; неизвестный чат → `ChatSessionNotFoundError`, агент не вызывается; занятый чат → `RunConflictError`; вопрос пишется до старта агента; события пересылаются наблюдателю по порядку; по `run-finished` вызывается `appendAgentAnswer` с автоназванием; при `run-failed` и `run-cancelled` ответ не пишется, вопрос остаётся; запись реестра освобождается в каждом исходе; отключение наблюдателя (`detach`) не прерывает запуск и ответ всё равно сохраняется; исключение в наблюдателе не прерывает запуск; чат удалён во время запуска → контекст агента удаляется (`ChatThreadPort.deleteThread`)
- [x] 6.2 Прогнать тесты из 6.1 и зафиксировать, что они падают (red): use-case ещё нет
- [x] 6.3 Реализовать `StartAgentRunUseCase` (вместо `AskQuestionUseCase`): валидация, `tryStart`, запись вопроса, фоновый `drive`, `observer.next`, сохранение ответа, `release` в `finally`
- [x] 6.4 Прогнать тесты из 6.1 и зафиксировать, что они зелёные (green), регрессий нет

## 7. CancelAgentRunUseCase и признак running (TDD)

- [x] 7.1 Написать тесты: `CancelAgentRunUseCase` отменяет активный запуск и не падает без запуска; `ListChatSessionsUseCase` и `GetChatMessagesUseCase` возвращают `running` из реестра; `DeleteChatSessionUseCase` сначала отменяет активный запуск, затем удаляет данные, и ответ после удаления не пишется (по specs `chat-sessions`: «Признак активного запуска», «Удаление чата»)
- [x] 7.2 Прогнать тесты из 7.1 и зафиксировать, что они падают (red)
- [x] 7.3 Реализовать `CancelAgentRunUseCase` и доработать `List`, `GetMessages`, `Delete` use-cases
- [x] 7.4 Прогнать тесты из 7.1 и зафиксировать, что они зелёные (green), регрессий в `chat-sessions.use-cases.spec.ts` нет

## 8. Преобразователи и контроллеры AG-UI (TDD)

- [x] 8.1 Написать тесты: `AgUiEventMapper` (`AgentEvent` → `RUN_STARTED`, `TEXT_MESSAGE_START/CONTENT/END`, `TOOL_CALL_START/ARGS/END`, `RUN_FINISHED`, `RUN_ERROR`, с признаком отмены); `ThreadMessageMapper` (`ChatMessage` → сообщения AG-UI: пользователь, ассистент с `toolCalls`); `AgentController` (400 на некорректное тело, 404 для неизвестного чата и 409 при занятом чате без потока, порядок событий SSE, закрытие соединения отписывает наблюдателя и не отменяет запуск); `ThreadsController` (маршруты `/threads`, `GET /threads/:id/messages` → `{messages, running}`, `POST /threads/:id/run/cancel` → 204 и идемпотентность)
- [x] 8.2 Прогнать тесты из 8.1 и зафиксировать, что они падают (red): маппера и новых контроллеров нет
- [x] 8.3 Реализовать `AgUiEventMapper`, `ThreadMessageMapper`, `AgentController` (`POST /agent`, SSE через `@ag-ui/encoder`, наблюдатель поверх `res`), переименовать `ChatSessionsController` в `ThreadsController` с маршрутами `/threads` и `run/cancel`
- [x] 8.4 Прогнать тесты из 8.1 и зафиксировать, что они зелёные (green), регрессий нет

## 9. Подключение модуля и удаление старого контракта

- [x] 9.1 Обновить `sheets-qa.module.ts`: новые провайдеры (`StartAgentRunUseCase`, `CancelAgentRunUseCase`, `ActiveRunRegistryPort` → `InMemoryActiveRunRegistry`), контроллеры `AgentController` и `ThreadsController`; добавить `OnApplicationShutdown`, отменяющий активные запуски; проверить, что приложение стартует (`npm run build`, `npm run start`) без ошибок DI
- [x] 9.2 Удалить `SheetsQaController`, `AskQuestionUseCase` и их тесты, старые маршруты `chat-sessions`; убедиться, что `grep -rn "sheets-qa/ask\|chat-sessions" backend/src` не находит живых ссылок
- [x] 9.3 Обновить `backend/src/modules/sheets-qa/README.md` (новые маршруты, события AG-UI, поведение запуска при закрытии соединения и отмене)
- [x] 9.4 Прогнать `npm test`, `npm run typecheck`, `npm run lint` в backend и зафиксировать, что всё зелёное
- [ ] 9.5 Ручная проверка с реальным `OPENROUTER_API_KEY`: `curl -N -X POST /agent` с вопросом стримит `TEXT_MESSAGE_CONTENT`; обрыв `curl` на середине не останавливает ответ, после завершения `GET /threads/:id/messages` содержит ответ и `running: false`; `POST /threads/:id/run/cancel` останавливает запуск; результаты записать в заметку к задаче

## 10. Клиент: API, агент и опрос запуска (TDD)

- [x] 10.1 Написать тесты (vitest, `fetch` замокан) для `shared/threads-api.ts` (list, create, rename, delete; `getThread(id)` → `{messages, running}` с сообщениями в формате AG-UI; `ThreadNotFoundError` на 404) и `shared/agent-client.ts` (`createAgent(threadId)` строит `HttpAgent` на `${backendUrl}/agent`; `cancelRun(threadId)` шлёт `POST /threads/:id/run/cancel`, 204 и 404 не ошибка)
- [x] 10.2 Прогнать тесты из 10.1 и зафиксировать, что они падают (red): модулей нет
- [x] 10.3 Реализовать `shared/threads-api.ts` (вместо `chat-sessions-api.ts`) и `shared/agent-client.ts`; обновить импорты; убрать `askAgent` из `shared/api.ts`, оставив общие хелперы, нужные другим модулям
- [x] 10.4 Прогнать тесты из 10.1 и зафиксировать, что они зелёные (green), регрессий в `quick-search.test.ts`, `active-session.test.ts` нет
- [x] 10.5 Написать тесты хука `useThreadRunStatus` (fake timers; по specs `chat-thread-ui` «Ответ агента после закрытия панели»): при `running=true` раз в 3 с перечитывает тред; при `running=false` останавливается и вызывает `onFinished` один раз; при смене треда и размонтировании очищает таймер; не опрашивает при `running=false`; ошибка запроса не останавливает опрос
- [x] 10.6 Прогнать тесты из 10.5 и зафиксировать, что они падают (red)
- [x] 10.7 Реализовать `sidepanel/use-thread-run-status.ts`
- [x] 10.8 Прогнать тесты из 10.5 и зафиксировать, что они зелёные (green), регрессий нет

## 11. Клиент: список чатов на threads-api (TDD)

- [x] 11.1 Обновить тесты `use-chat-sessions.test.tsx` под `threads-api` и поле `running` у чата (по specs `chat-session-switcher`: создание, переключение, переименование, удаление, восстановление активного чата)
- [x] 11.2 Прогнать обновлённые тесты и зафиксировать, что они падают (red) на старом API
- [x] 11.3 Перевести `use-chat-sessions.ts`, `ChatSessionList`, `ChatSessionItem`, `ChatHeader` на `threads-api` и `running`
- [x] 11.4 Прогнать тесты и зафиксировать, что они зелёные (green), регрессий в `ChatHeader.test.tsx`, `ChatSessionList.test.tsx`, `panel-layout.test.ts` нет

## 12. Клиент: ChatRuntimeProvider (TDD)

- [x] 12.1 Написать тесты `ChatRuntimeProvider` (по specs `chat-thread-ui`, `chat-session-switcher`): `onSwitchToThread` загружает историю и возвращает сообщения AG-UI; `onSwitchToNewThread` создаёт тред и делает его активным; отправка использует `threadId` активного чата; `onCancel` вызывает `cancelRun(threadId)`; смена чата во время ответа не пишет ответ в другой чат
- [x] 12.2 Прогнать тесты из 12.1 и зафиксировать, что они падают (red)
- [x] 12.3 Реализовать `sidepanel/ChatRuntimeProvider.tsx`: `useAgUiRuntime` + `HttpAgent` + `adapters.threadList`; сохранить `activeSessionId` в `chrome.storage` через `active-session`
- [x] 12.4 Прогнать тесты из 12.1 и зафиксировать, что они зелёные (green), регрессий нет

## 13. Клиент: компоненты чата по макету (ui-design.md)

Читать макет через `mcp__pencil__execute` (`filePath: "design/synergy-design-kit.pen"`) → `Get(<node id>, {depth: 4})` и `TakeScreenshot([<node id>])`; верстку не угадывать по описанию.

- [x] 13.1 Написать тесты `ToolCallGroup` (по specs «Ход работы агента»): по умолчанию свёрнут, раскрывается по клику, показывает имя, аргументы и статус «выполняется»/«завершён», счётчик в заголовке, состояние «прервано»
- [x] 13.2 Прогнать тесты из 13.1 и зафиксировать, что они падают (red)
- [x] 13.3 Реализовать `ToolCallGroup` по компонентам UI Kit `AHgP8` (Tool Trace) и `Q9teX` (Tool Call Row); сверить со слотами `kERUO` (раскрыт), `QvaMk` (свёрнут, «прервано»), `Zkn8Q` (спиннер у выполняемого вызова)
- [x] 13.4 Прогнать тесты из 13.1 и зафиксировать, что они зелёные (green)
- [x] 13.5 Написать тесты `ErrorMessage` и `RunningIndicator` (по specs «Ошибка и повтор», «Остановка ответа», «Ответ агента после закрытия панели»): `ErrorMessage` показывает текст и вызывает `onRetry`; сообщение о недоступности сервера содержит указание проверить настройки; `RunningIndicator` показывает «Агент ещё отвечает», вариант «Ответ остановлен» с действием «Повторить вопрос»
- [x] 13.6 Прогнать тесты из 13.5 и зафиксировать, что они падают (red)
- [x] 13.7 Реализовать `ErrorMessage` и `RunningIndicator` по компоненту `HfVTG` (Run Notice) и слотам `fdooH` (ошибка и повтор), `QvaMk` (остановлен), `x1i0U` (возврат в идущий ответ)
- [x] 13.8 Прогнать тесты из 13.5 и зафиксировать, что они зелёные (green)
- [x] 13.9 Реализовать `AssistantMessage` и `UserMessage` на примитивах assistant-ui по пузырям из слота `kERUO` (и `y7NAtb` в `KBBna`); сохранить текущий рендер markdown (`react-markdown`, `remark-gfm`) в ответах агента. Тесты не заводятся только для статичной разметки пузыря без ветвлений: логика потока и вызовов покрыта в 13.1–13.8 и 14.1; рендер markdown проверяется существующим сценарием в 14.1
- [x] 13.10 Реализовать `ThreadView` по фрейму `GHRO6` (слоты `Zkn8Q`, `kERUO`, `QvaMk`, `fdooH`, `x1i0U`): лента, композер, кнопка «Остановить» вместо «Спросить» во время запуска (`Stop` на `pbEvR` с обводкой `$border-strong`), блокировка отправки, сохранение черновика при ошибке сервера. Логика композера покрыта тестами 14.1

## 14. Клиент: сборка экрана и сценарии (TDD)

- [x] 14.1 Написать интеграционные тесты `App`/`ThreadView` с замоканным агентом (по всем сценариям specs `chat-thread-ui` и `chat-session-switcher`): ответ растёт по фрагментам, индикатор пропадает по завершению; «Остановить» вызывает `cancelRun`, текст остаётся с пометкой; ошибка → «Повторить» отправляет последний вопрос заново; недоступный сервер сохраняет набранный вопрос; открытие чата с `running=true` показывает индикатор, блокирует отправку и после опроса подставляет готовый ответ; переключение чата во время ответа не смешивает ответы; форма быстрого подбора отправляет запрос как вопрос в активный чат и называет чат по параметрам; markdown в ответе агента рендерится
- [x] 14.2 Прогнать тесты из 14.1 и зафиксировать, что они падают (red)
- [x] 14.3 Собрать `sidepanel/App.tsx`: `ChatRuntimeProvider` + `ThreadView` + `ChatSessionList`; подключить `QuickSearchForm` и `NextSteps` через `useThreadRuntime().append`; подключить `useThreadRunStatus`; сохранить раскладку `panel-layout.ts` (узкая/широкая панель) и `form-visibility.ts`
- [x] 14.4 Удалить `use-chat.ts`, `use-chat.test.tsx`, `ChatView.tsx`, `ChatView.test.tsx`, `Message.tsx`; убедиться, что `grep -rn "use-chat'\|ChatView\|askAgent" manager-helper/src` не находит живых ссылок
- [x] 14.5 Прогнать тесты из 14.1 и зафиксировать, что они зелёные (green); прогнать `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` в `manager-helper` и зафиксировать, что всё зелёное

## 15. Проверка вместе: сервер и расширение

- [ ] 15.1 Собрать расширение (`npm run build`), загрузить `dist` как распакованное в Chrome, запустить backend с реальным ключом; пройти сценарии specs и записать результат по каждому: стриминг ответа; свёрнутый и раскрытый «Ход работы»; «Остановить»; закрыть панель посреди ответа и открыть снова (индикатор, затем готовый ответ); ошибка и «Повторить» (остановить backend); существующий чат (созданный до перехода) продолжается с историей; удаление чата во время ответа; переключение чата во время ответа; широкая панель ≥640 px
- [ ] 15.2 Сверить итоговый UI с `GHRO6` по скриншоту панели и зафиксировать расхождения (исправить или записать причину)

## 16. Code review

- [ ] 16.1 Запустить code-review (скилл `code-review`) по всем изменениям фичи - от коммита `87e81a3` до текущего HEAD: соответствие стандартам проекта и specs этого change
- [ ] 16.2 Исправить замечания ревью (блокирующие и существенные обязательно; остальные - исправить или явно отклонить с обоснованием), результат зафиксировать коммитом
- [ ] 16.3 Повторить code-review по правкам из 16.2 и убедиться, что блокирующих замечаний нет; прогнать тесты и зафиксировать, что они зелёные
