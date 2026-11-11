# Architecture: add-assistant-module

## Scope
Только backend. Новый модуль `assistant` (чаты, запуск, сборка агентов по профилю клиента); контракт возможности агента в `shared`; слой агента в `tasks`; `sheets-qa` сокращается до агента по ценам; `telegram` подключает агента вместо заглушки. Клиенты (control-center, manager-helper) добавляют заголовок `X-Client-App`; HTTP-пути и формат событий сохраняются.

---

## Backend — Domain Model

### Entities
| Name | Status (new/existing) | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `ChatSession` (assistant) | existing, переезжает из `sheets-qa`, изменяется | да | `id`, `ownerId`, `channel: 'app' \| 'telegram'`, `title`, `titleIsCustom`, `lastActivityAt` | Чат агента. Принадлежит пользователю и знает свой канал |
| `ChatMessage` (assistant) | existing, переезжает | нет (часть `ChatSession`) | `role`, `text`, `toolCalls`, `durationMs` | История чата, без изменений |
| `AgentRun` (assistant) | existing, переезжает | нет | `threadId`, `runId`, abort-сигнал | Активный запуск агента; один на чат |
| `Task` (tasks) | existing | да | `id`, `title`, `creatorId`, `assigneeId`, `deadline` | Создаётся инструментом агента, без изменений |
| `TelegramLink` (telegram) | existing | да | `userId`, `identity` | Источник `userId` для Telegram-диалога, без изменений |

### Aggregates
| Aggregate | Root entity | Входит в состав (entities/VO) | Инварианты, которые защищает |
|---|---|---|---|
| `ChatSession` | `ChatSession` | `ChatMessage`, `ChatTitle`, `ChatChannel` | Владелец обязателен и не меняется. Канал не меняется после создания. У пользователя не больше одного диалога `telegram` (частичный уникальный индекс). Доступ к чату имеет только владелец |

### Value Objects
| Name | Поля | Почему VO (immutable/self-validating) |
|---|---|---|
| `ChatChannel` (assistant, new) | `'app' \| 'telegram'` | Закрытое множество, проверяется при чтении из БД |
| `ClientId` (assistant, new) | `'manager-app' \| 'employee-app' \| 'telegram'` | Закрытое множество клиентов; ключ реестра профилей |
| `AgentProfileId` (assistant, new) | `'app' \| 'telegram'` | Выбирает сборку агента; закрытое множество |
| `AgentRunContext` (shared/agent-capability, new) | `userId`, `threadId` | Неизменяемый контекст запуска для инструментов; `userId` не пустой |
| `RunInput` (assistant, existing, изменяется) | `threadId`, `runId`, `question`, `+ownerId`, `+client` | Неизменяемый вход запуска; валидирует вопрос (длина, пустота) |
| `AgentEvent` (assistant, existing, переезжает) | тип события, данные | Единица потока AG-UI, без изменений |

### Services
| Service | Слой (application/domain/infrastructure) | Ответственность |
|---|---|---|
| `StartAgentRunUseCase` (assistant, existing, изменяется) | application | Запуск агента в чате владельца: проверка владения, один активный запуск, сохранение сообщений |
| `AskInTelegramUseCase` (assistant, new) | application | Найти или создать Telegram-диалог пользователя, запустить профиль `telegram`, вернуть итоговый текст |
| `CreateChatSessionUseCase`, `ListChatSessionsUseCase`, `GetChatMessagesUseCase`, `RenameChatSessionUseCase`, `DeleteChatSessionUseCase`, `CancelAgentRunUseCase` (assistant, existing, изменяются) | application | Те же сценарии, но с `ownerId`; чужой чат = «не найдено»; список только `channel = 'app'` |
| `AgentRunnerPort` (assistant, existing как `SheetsAssistantPort`, переименовывается) | domain (порт) | Запуск агента и поток `AgentEvent` |
| `LangGraphAgentRunner` (assistant, new, на базе `DeepAgentsSheetsAssistant`) | infrastructure | Собирает агента на запуск через `AgentProfileFactory`, стримит и маппит события, тайм-аут и отмена |
| `AgentProfileFactory` (assistant, new) | infrastructure | По `ClientId` выбирает профиль и собирает агента из возможностей |
| `ClientProfileRegistry` (assistant, new) | application | Карта `ClientId → AgentProfileId`; неизвестный клиент → ошибка |
| `ClientResolver` (assistant, new) | interface (http) | Читает `X-Client-App`: `manager-app`/`employee-app` → `ClientId`, нет заголовка → «приложение», иное значение или `telegram` → 400 |
| `ChatSessionRepositoryPort`, `ChatThreadPort`, `ActiveRunRegistryPort` (assistant, existing, переезжают) | domain (порты) | Хранилище чатов, thread/checkpointer, реестр активных запусков |
| `AgentCapability` (shared/agent-capability, new) | contract | Контракт: имя, описание, режим контекста, фабрика агента |
| `TasksAgentCapability` (tasks, new) | interface (agent) | Возможность «задачи»: `createAgent`, промпт, инструменты |
| `create_task`, `search_tasks`, `find_users`, `update_task` (tasks, new) | interface (agent) | Инструменты над `CreateTaskUseCase`, `ListTasksUseCase`, `UpdateTaskUseCase`, справочником пользователей; `userId` берут из контекста запуска |
| `UserDirectory.searchActive` (tasks, existing порт, новый метод) | domain (порт) + infrastructure | Поиск активных пользователей по строке |
| `SheetsQaAgentCapability` (sheets-qa, new) | infrastructure | Возможность «цены»: существующий deep agent с подагентами по уровням |
| `AssistantFreeTextHandler` (telegram, new, заменяет `NotSupportedFreeTextHandler`) | application/adapter | Реализует `FreeTextHandlerPort`, вызывает `AskInTelegramUseCase` |

### Method Signatures (ключевые, по каждому сервису)
| Service.Method | Params | Returns | Краткое описание |
|---|---|---|---|
| `StartAgentRunUseCase.execute` | `props: RunInputProps` (с `ownerId`, `client`), `observer: RunObserver` | `Promise<AgentRun>` | Проверяет владельца, запускает агента, поток уходит наблюдателю |
| `AskInTelegramUseCase.execute` | `userId: string`, `text: string` | `Promise<string>` | Диалог Telegram пользователя → ответ агента текстом; при занятом диалоге возвращает «подождите» |
| `ListChatSessionsUseCase.execute` | `ownerId: string` | `Promise<ChatSessionSummary[]>` | Чаты владельца с `channel = 'app'` |
| `ChatSessionRepositoryPort.findOwned` | `id: string`, `ownerId: string` | `Promise<ChatSession \| null>` | `null` и для чужого, и для несуществующего |
| `ChatSessionRepositoryPort.findOrCreateTelegram` | `ownerId: string` | `Promise<ChatSession>` | Единственный диалог `telegram` пользователя |
| `AgentRunnerPort.stream` | `input: RunInput`, `signal: AbortSignal` | `AsyncGenerator<AgentEvent>` | Запуск и поток событий |
| `ClientResolver.resolve` | `request` (заголовок `X-Client-App`) | `ClientId` или ошибка валидации | Определяет клиента HTTP-запроса; тело запроса не читает |
| `AgentProfileFactory.build` | `client: ClientId`, `ctx: AgentRunContext`, `checkpointer` | `Promise<Agent>` | Собирает агента профиля клиента |
| `AgentCapability.buildAgent` | `ctx: AgentRunContext`, `options?: { checkpointer }` | `ReactAgent \| Runnable` | Агент возможности; в `app` — подагент, в `telegram` — верхний агент |
| `update_task.execute` | `taskId: string`, `patch: TaskPatch` (только названные поля), контекст запуска | `TaskView` или причина отказа | Находит задачу по id, вызывает `UpdateTaskUseCase.execute(Actor.of(userId), taskId, patch)` |
| `UserDirectory.searchActive` | `query: string`, `limit: number` | `Promise<DirectoryUser[]>` | Активные пользователи по подстроке имени |
| `FreeTextHandlerPort.handle` | `sender: LinkedBotSender`, `text: string` | `Promise<string>` | Существующий порт; реализация вызывает `AskInTelegramUseCase` |

---

## Frontend — UI Model

Меняются только HTTP-клиенты приложений: они добавляют в запросы чатов и агента заголовок `X-Client-App`. Интерфейс, страницы, фичи и компоненты не затрагиваются.

| Приложение | Что меняется | Расположение |
|---|---|---|
| control-center (Electron) | Добавить `X-Client-App` в запросы чатов и агента; запросы идут через main-процесс (`cc-api-protocol.ts`), проверить, что заголовок не отбрасывается | `src/main/cc-api-protocol.ts`, `src/renderer/src/lib/backend/agent.ts`, `threads.api` |
| manager-helper (расширение) | Добавить `X-Client-App` в `agent-client` | `src/shared/agent-client.ts` |

Какое значение у какого приложения (`manager-app` или `employee-app`), задаёт владелец продукта при реализации. После миграции списки чатов будут пустыми.

### Паттерны, которые нужно учесть при проектировании
Не применимо: правка ограничена транспортным слоем клиентов.

---

## Diagrams

Диаграммы даны текстом внутри файла. Ссылки на Miro нет: доска не создавалась. Если нужны диаграммы в Miro, они создаются по запросу.

### 1. Domain Entity Interaction
Miro link: не создавалась (текстовое представление)

```
User (auth_users)
  └─ 1 ──── * ChatSession (assistant)   [ownerId, channel: app|telegram]
                 └─ 1 ──── * ChatMessage
                 └─ 1 ──── 1 thread (LangGraph checkpoint, thread_id = ChatSession.id)
TelegramLink (telegram) ──userId──> User   (источник ownerId для channel = telegram)
Task (tasks) ──creatorId/assigneeId──> User
AgentCapability (shared) ◄── реализует ── TasksAgentCapability (tasks)
                         ◄── реализует ── SheetsQaAgentCapability (sheets-qa)
ClientProfileRegistry:  ClientId ──> AgentProfileId ──> набор AgentCapability
```

### 2. External Modules Interaction
Miro link: не создавалась (текстовое представление)

```
control-center / manager-helper ──HTTP+SSE──> assistant ──┬─> shared/agent-capability (контракт)
                                                          ├─> tasks        (TasksAgentCapability → use-case'ы tasks)
                                                          └─> sheets-qa    (SheetsQaAgentCapability → книги, подагенты)

Telegram Bot API ──updates──> telegram ──FreeTextHandlerPort──> AssistantFreeTextHandler
                                                      └──> assistant.AskInTelegramUseCase

Направление зависимостей (только в одну сторону):
  telegram → assistant → shared ← tasks, sheets-qa
  assistant → tasks, sheets-qa (только через экспорт возможностей в модуле)
  tasks, sheets-qa → assistant: нет.   assistant → telegram: нет.
Вызовы: HTTP — синхронный запрос с асинхронным потоком SSE; Telegram — синхронный ответ строкой.
Внешние: LLM-провайдер (OpenAI-совместимый / OpenRouter), Postgres (чаты, checkpointer).
```

### 3. Layer Interaction — от Controller до Response

Miro link: не создавалась (текстовое представление)

```
Приложение (HTTP):
  AgentController (@CurrentUser → ownerId; ClientResolver.resolve(X-Client-App) → client; неизвестное значение → 400)
    → StartAgentRunUseCase.execute
        → ChatSessionRepositoryPort.findOwned(id, ownerId)   — null → ChatSessionNotFoundError → 404
        → ActiveRunRegistryPort.tryStart                      — занято → RunConflictError → 409
        → ChatSessionRepositoryPort.appendUserMessage
        → AgentRunnerPort.stream (LangGraphAgentRunner)
            → AgentProfileFactory.build(client, ctx{userId, threadId}, checkpointer)
                профиль app: createDeepAgent(sheets-qa [isolated], tasks [fork])
            → streamEvents → StreamEventMapper → AgentEvent
        → SseRunObserver → SSE-ответ клиенту
        → по завершению: сохранить ответ, обновить lastActivityAt, release registry
  Ошибки: валидация вопроса → 400; ошибка/тайм-аут агента → событие ошибки, ответ не сохраняется.

Telegram:
  telegram: BotUpdateDispatcher → AssistantFreeTextHandler.handle(sender, text)
    → AskInTelegramUseCase.execute(sender.userId, text)
        → findOrCreateTelegram(ownerId)
        → ActiveRunRegistryPort.tryStart                      — занято → «подождите ответа»
        → AgentRunnerPort.stream, client = telegram
            → AgentProfileFactory.build → профиль telegram: TasksAgentCapability.buildAgent(ctx, {checkpointer})
            → инструменты (create_task, search_tasks, find_users, update_task) берут userId из ctx, строят Actor, вызывают use-case'ы tasks
        → собрать итоговый текст → строка ответа
    → BotMessenger отправляет ответ в чат
  Ошибки: сбой/тайм-аут агента → «не смог обработать, повторите»; приём следующих обновлений не прерывается.
```

---

## Confirmation Checklist
- [ ] Названия entity/aggregate/VO согласованы
- [ ] Названия и сигнатуры ключевых методов сервисов согласованы
- [ ] Слои (pages/features/kernel/shared), структура model/ui и паттерны фронта согласованы (frontend не меняется)
- [ ] Диаграммы взаимодействия отражают ожидаемую реализацию
- [ ] Пользователь подтвердил переход к tasks.md
