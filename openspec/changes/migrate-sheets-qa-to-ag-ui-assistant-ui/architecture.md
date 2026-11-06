# Architecture: migrate-sheets-qa-to-ag-ui-assistant-ui

## Scope

Backend-модуль `backend/src/modules/sheets-qa` (запуск агента, чаты-threads, реестр активных запусков) и расширение `manager-helper` (side panel: чат на assistant-ui). Страница `options` содержит только настройки адреса бэкенда и не затрагивается. Решения — в `design.md`, поведение — в `specs/`.

Примечание по шаблону: `frontend/CLAUDE.md` и слои FSD в этом репозитории отсутствуют. `manager-helper` — расширение Chrome (React 19, Vite, Tailwind 4) с плоской структурой `sidepanel/` + `shared/`. Раздел Frontend описывает фактическую структуру, а пункты шаблона про FSD помечены как неприменимые.

---

## Backend — Domain Model

Слои модуля сохраняются: `domain` → `application` → `infrastructure` / `interface`. Домен ничего не знает про AG-UI, LangGraph и SSE.

### Entities
| Name | Status | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `ChatSession` | existing | да | `id` (uuid, он же `threadId`), `title`, `titleIsCustom`, `createdAt`, `lastActivityAt` | Чат = thread; без изменений |
| `ChatMessage` | existing | нет | `id`, `sessionId`, `role` (`user`/`agent`), `text`, `toolCalls`, `durationMs`, `createdAt` | Сообщение истории; без изменений |
| `AgentRun` | new | да (непостоянный, только в памяти) | `threadId`, `runId`, `status` (`running` / `finished` / `failed` / `cancelled`), `startedAt`, `signal` | Идущий запуск агента в чате; защищает инвариант «один активный запуск на чат» и «терминальное состояние ставится один раз» |

### Aggregates
| Aggregate | Root entity | Входит в состав | Инварианты |
|---|---|---|---|
| Chat | `ChatSession` | `ChatMessage` (читаются и пишутся через репозиторий), `ChatTitle` | Явное название не перезаписывается автоназванием; переименование не меняет `lastActivityAt` |
| Run | `AgentRun` | `RunInput`, поток `AgentEvent` | Один активный запуск на `threadId`; переход в терминальное состояние необратим; неполный ответ не попадает в историю |

### Value Objects
| Name | Поля | Почему VO |
|---|---|---|
| `ChatTitle` (existing) | `value` | Самопроверяющийся (1–120 символов), неизменяемый |
| `RunInput` (new) | `threadId`, `runId`, `question` | Нормализованный вход запуска: вопрос обрезан, непустой, не длиннее лимита |
| `AgentEvent` (new) | объединение: `run-started`, `text-delta {text}`, `tool-call-started {callId, name, args}`, `tool-call-finished {callId}`, `run-finished {answer, toolCalls, durationMs}`, `run-failed {message}`, `run-cancelled` | Доменный язык событий агента, независимый от AG-UI |
| `ToolCallTrace` (existing) | `name`, `args` | Запись вызова инструмента |

### Ports (domain/ports)
| Port | Статус | Назначение |
|---|---|---|
| `SheetsAssistantPort` | modified | `ask()` заменяется на `stream(input, signal): AsyncIterable<AgentEvent>` |
| `ActiveRunRegistryPort` | new | Реестр активных запусков: `tryStart`, `get`, `isRunning`, `cancel`, `release` |
| `ChatSessionRepositoryPort` | existing | Без изменений контракта |
| `ChatThreadPort` | existing | Удаление контекста агента по `threadId` |

### Services
| Service | Слой | Ответственность |
|---|---|---|
| `StartAgentRunUseCase` | application, new (заменяет `AskQuestionUseCase`) | Валидирует вопрос, проверяет чат, регистрирует запуск (конфликт → 409), пишет вопрос, запускает агента в фоне, пересылает события подписчику, по `run-finished` сохраняет ответ, всегда освобождает реестр |
| `CancelAgentRunUseCase` | application, new | Идемпотентная отмена запуска чата |
| `ListChatSessionsUseCase` | application, existing, modified | Добавляет признак `running` из реестра |
| `GetChatMessagesUseCase` | application, existing, modified | Добавляет признак `running` к истории |
| `DeleteChatSessionUseCase` | application, existing, modified | Сначала отменяет активный запуск, затем удаляет чат и контекст агента |
| `CreateChatSessionUseCase`, `RenameChatSessionUseCase` | application, existing | Без изменений |
| `DeepAgentsSheetsAssistant` | infrastructure, existing, modified | Собирает агента `createDeepAgent`, вызывает `streamEvents` v2, переводит события LangGraph в `AgentEvent` |
| `InMemoryActiveRunRegistry` | infrastructure, new | Реализация реестра на `Map<threadId, AgentRun>` |
| `AgentController` | interface, new | `POST /agent`: принимает `RunAgentInput`, отдаёт SSE |
| `ThreadsController` | interface, переименован из `ChatSessionsController` | `/threads` (CRUD), `GET /threads/:id/messages`, `POST /threads/:id/run/cancel` |
| `AgUiEventMapper` | interface, new | `AgentEvent` → события AG-UI (`RUN_STARTED`, `TEXT_MESSAGE_*`, `TOOL_CALL_*`, `RUN_FINISHED`, `RUN_ERROR`) |
| `ThreadMessageMapper` | interface, new | `ChatMessage` → сообщения AG-UI (user, assistant с `toolCalls`, tool) |
| `SheetsQaController` | interface, existing | **Удаляется** (`POST /sheets-qa/ask`) |

### Method Signatures (ключевые)
| Service.Method | Params | Returns | Описание |
|---|---|---|---|
| `StartAgentRunUseCase.execute` | `input: RunInput`, `observer: RunObserver` | `Promise<AgentRun>` | Проверяет, регистрирует, пишет вопрос и запускает `drive` в фоне; бросает `InvalidQuestionError`, `ChatSessionNotFoundError`, `RunConflictError` |
| `StartAgentRunUseCase.drive` (private) | `run: AgentRun`, `session: ChatSession`, `input: RunInput` | `Promise<void>` | Читает `assistant.stream`, вызывает `observer.next(event)` пока он подключён, по `run-finished` вызывает `appendAgentAnswer`, в `finally` — `registry.release` |
| `CancelAgentRunUseCase.execute` | `threadId: string` | `Promise<void>` | `registry.cancel(threadId)`; без запуска — no-op |
| `ActiveRunRegistryPort.tryStart` | `threadId`, `runId` | `AgentRun \| null` | `null`, если в чате уже есть запуск |
| `ActiveRunRegistryPort.isRunning` | `threadId` | `boolean` | Для `running` в списке и истории |
| `ActiveRunRegistryPort.cancel` | `threadId` | `void` | Вызывает `abort` у `AgentRun` |
| `ActiveRunRegistryPort.release` | `threadId`, `runId` | `void` | Удаляет запись, только если `runId` совпадает |
| `SheetsAssistantPort.stream` | `input: RunInput`, `signal: AbortSignal` | `AsyncIterable<AgentEvent>` | Потоковый запуск агента в треде |
| `AgentController.run` | `body: RunAgentInput`, `res`, `req` | `void` | Валидирует тело (zod), стартует запуск, кодирует события в SSE; закрытие соединения только отписывает наблюдателя |
| `ThreadsController.cancelRun` | `id: string` | `void` (204) | Вызывает `CancelAgentRunUseCase` |
| `ThreadsController.messages` | `id: string` | `{ messages: AgUiMessage[]; running: boolean }` | История в формате AG-UI и признак запуска |

`RunObserver` — интерфейс `{ next(event: AgentEvent): void; close(): void }`; контроллер реализует его поверх SSE-ответа, при разрыве соединения вызывается `detach`, и события отбрасываются.

---

## Frontend — UI Model

Структура `manager-helper/src`: `sidepanel/` (компоненты и хуки панели), `shared/` (API, хранилище, конфиги), `background/` и `content/` не затрагиваются. Правило: компоненты assistant-ui — основа; свой код только для списка чатов, формы быстрого подбора и раскладки.

### Pages
| Page | Route | Структура | Назначение |
|---|---|---|---|
| Side panel (`sidepanel/index.html` → `App.tsx`) | — | `App` + `ChatRuntimeProvider` + `ThreadView` / `ChatSessionList` | Единственный экран с чатом |
| Options (`options/App.tsx`) | — | без изменений | Настройки адреса бэкенда |

### Features (модули с логикой)
| Module | Статус | Публичный API | Содержимое | Назначение |
|---|---|---|---|---|
| `ChatRuntimeProvider` | new | компонент | `useAgUiRuntime`, `HttpAgent`, `adapters.threadList`, `onCancel` → `cancelRun` | Подключает assistant-ui к AG-UI и к выбору треда |
| `ThreadView` | new (заменяет `ChatView`) | компонент | `ThreadPrimitive.*`, `ComposerPrimitive.*` | Лента сообщений, композер, «Остановить», «Повторить» |
| `ChatSessionList`, `ChatSessionItem`, `ChatHeader` | existing | компоненты | без изменений логики, данные из `use-chat-sessions` | Список, переименование, удаление чатов |
| `QuickSearchForm`, `NextSteps` | existing | компоненты | отправка запроса через `useThreadRuntime().append` вместо `use-chat` | Быстрый подбор и следующие шаги |

### UI-компоненты
| Component | Расположение | Props (основные) | Назначение |
|---|---|---|---|
| `AssistantMessage` | `sidepanel/` new (заменяет `Message`) | — (данные из контекста сообщения) | Ответ агента, потоковый текст, пометка «прервано» |
| `UserMessage` | `sidepanel/` new | — | Сообщение пользователя |
| `ToolCallGroup` | `sidepanel/` new | `toolCalls`, `status` | Свёрнутый список вызовов инструментов со статусом «выполняется / завершён» |
| `RunningIndicator` | `sidepanel/` new | `onStop` | Индикатор «агент отвечает» и кнопка «Остановить» для возврата в идущий запуск |
| `ErrorMessage` | `sidepanel/` new | `message`, `onRetry` | Ошибка с «Повторить» |
| `Message.tsx`, `ChatView.tsx` | `sidepanel/` | — | **Удаляются** |

### Hooks / модули данных
| Hook / модуль | Расположение | Тип | Возвращает |
|---|---|---|---|
| `useChatSessions` | `sidepanel/use-chat-sessions.ts`, modified | state-хук | список чатов, активный чат, create/rename/remove (теперь через `threads-api`) |
| `useThreadRunStatus` | `sidepanel/use-thread-run-status.ts`, new | state-хук | `running` активного чата; пока `true`, раз в несколько секунд перечитывает историю и сообщает, когда запуск завершён |
| `createAgent(threadId)` | `shared/agent-client.ts`, new | фабрика | `HttpAgent` на `${backendUrl}/agent` |
| `cancelRun(threadId)` | `shared/agent-client.ts`, new | функция | `POST /threads/:id/run/cancel` |
| `threads-api` | `shared/threads-api.ts` (заменяет `chat-sessions-api.ts`) | API | `listThreads`, `createThread`, `renameThread`, `deleteThread`, `getThread(id)` → `{messages, running}` |
| `active-session` | `shared/active-session.ts`, existing | хранилище | id активного чата в `chrome.storage` |
| `use-chat.ts`, `shared/api.ts` (`askAgent`) | — | — | **Удаляются** |

### Паттерны (применимость)
- [ ] Слои FSD и `index.ts` как публичный API — не применимо (в `manager-helper` плоская структура)
- [ ] Запросы через query options factory — не применимо (TanStack Query в расширении не используется; запросы остаются обычными функциями `threads-api`)
- [x] Ошибки API нормализуются в одном месте: `threads-api` и `agent-client` бросают типизированные ошибки (`ThreadNotFoundError`, `RunConflictError`)
- [x] Разделение «первичная загрузка» и «обновление»: опрос `running` не сбрасывает уже показанную историю
- [x] Layout принимает именованные слоты: раскладка `panel-layout.ts` остаётся прежней
- [x] Новые компоненты на текущих токенах Tailwind и новом дизайне, без возврата старых стилей

---

## Diagrams

Диаграммы лежат на существующей доске «СИНЕРГИЯ» в области с координатами x≈12000, y≈12000–19000 (правее и ниже прежнего содержимого); ссылка открывает нужную диаграмму.

### 1. Domain Entity Interaction
Miro link: https://miro.com/app/board/uXjVHjUxSWc=/?moveToWidget=3458764689627946316

### 2. External Modules Interaction
Miro link: https://miro.com/app/board/uXjVHjUxSWc=/?moveToWidget=3458764689627946315

### 3. Layer Interaction — от Controller до Response
Показывает запуск, закрытие панели посреди ответа и явную отмену.
Miro link: https://miro.com/app/board/uXjVHjUxSWc=/?moveToWidget=3458764689627946317

---

## Confirmation Checklist
- [ ] Названия entity/aggregate/VO согласованы
- [ ] Названия и сигнатуры ключевых методов сервисов согласованы
- [ ] Структура фронтенда (плоская, без FSD), набор компонентов и хуков согласованы
- [ ] Диаграммы взаимодействия отражают ожидаемую реализацию
- [ ] Пользователь подтвердил переход к tasks.md
