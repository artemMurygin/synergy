# Architecture: add-telegram-voice-task-agent

## Scope
Только backend, поверх `add-assistant-module`.
- Новый модуль `transcription`.
- `telegram`: типы сообщений, голос, фоновая очередь, «печатает…», нарезка ответа, `/new`.
- `assistant`: сброс Telegram-диалога.
- `tasks/interface/agent`: скилл постановки задачи и текущая дата в промпте.

Миграций, изменений HTTP API и клиентов нет.

---

## Backend — Domain Model

### Entities
| Name | Status (new/existing) | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `ChatSession` (assistant) | existing | да | `id`, `ownerId`, `channel` | Telegram-диалог владельца; `/new` удаляет его, следующее сообщение создаёт новый через `findOrCreateTelegram`. Модель не меняется |
| `TelegramLink` (telegram) | existing | да | `userId`, `identity` | Источник `ownerId` для агента и расшифровки; без изменений |
| `Task` (tasks) | existing | да | `title`, `creatorId`, `assigneeId`, `deadline` | Создаётся инструментом `create_task` после подтверждения; без изменений |

### Aggregates
| Aggregate | Root entity | Входит в состав (entities/VO) | Инварианты, которые защищает |
|---|---|---|---|
| `ChatSession` | `ChatSession` | `ChatMessage`, `ChatTitle` | Без изменений: один Telegram-диалог на владельца (уникальный индекс), владелец и канал не меняются |

Новых агрегатов нет.

### Value Objects
| Name | Поля | Почему VO (immutable/self-validating) |
|---|---|---|
| `VoiceClip` (transcription, new) | `audio: Buffer`, `mimeType`, `durationSec`, `sizeBytes` | Самопроверка: длительность ≥ 0, размер > 0. Лимиты проверяет use case, чтобы отказ был результатом, а не исключением |
| `TranscriptionResult` (transcription, new) | `kind: 'text' \| 'no-speech' \| 'rejected'`, `text?`, `reason?: 'too-long' \| 'too-large' \| 'unsupported-format' \| 'provider-unavailable'` | Тип-сумма; `text` непустой только при `kind = 'text'`, `reason` только при `rejected` |
| `MessageContent` (telegram, new) | `kind: 'text' \| 'voice' \| 'unsupported'`, `text?`, `fileId?`, `durationSec?`, `mimeType?`, `fileSize?` | Тип содержимого сообщения после разбора обновления |
| `IncomingMessage` (telegram, existing, изменяется) | `text` → `content: MessageContent` | Команды разбираются только из `content.kind = 'text'` |
| `BotCommand` (telegram, existing, изменяется) | `name` + `'new'` | Закрытое множество команд |
| `AgentRunContext` (shared/agent-capability, existing) | `userId`, `threadId` | Без изменений; источник `actor` для инструментов задач |

### Services
| Service | Слой (application/domain/infrastructure) | Ответственность |
|---|---|---|
| `TranscriberPort` (transcription, new) | domain port | Абстракция провайдера распознавания |
| `OpenRouterTranscriber` (transcription, new) | infrastructure | `POST {OPENROUTER_BASE_URL}/chat/completions` с `input_audio` (ogg), промпт «дословно», `AbortSignal` на 30 с, пустой ответ → `no-speech` |
| `TranscribeVoiceUseCase` (transcription, new) | application | Лимиты 3 мин / 5 МБ до провайдера, таймаут, сбой → `rejected('provider-unavailable')`, лог без аудио и текста. Единственный экспорт модуля |
| `BotUpdateDispatcher` (telegram, existing, изменяется) | application | Разбор `text`, `voice` и `unsupported`; команды сразу; агентный путь через `ChatWorkQueue`; ответ «понимаю только текст и голос»; `/new` |
| `ChatWorkQueue` (telegram, new) | application | В памяти процесса: одна работа на `chatId`, `typing` каждые 4 с, поколение чата для отбрасывания результата после `/new`, лог ошибок |
| `VoiceMessageHandler` (telegram, new) | application | `getFile` → `downloadFile` → `TranscribeVoiceUseCase` → «Распознал: …» или текст отказа → текст для агента |
| `AssistantFreeTextHandler` (telegram, existing, изменяется) | application | Возвращает части ответа (`string[]`) вместо одного обрезанного сообщения |
| `splitTelegramMessage` (telegram, new) | application | Нарезка экранированного HTML на части ≤ 4096: по абзацам, затем по строкам, затем жёстко |
| `BotReplies` (telegram, existing, изменяется) | application | `+stillProcessing`, `+unsupportedMessage`, `+voiceRecognized`, `+voiceTooLong`, `+voiceTooLarge`, `+voiceNoSpeech`, `+voiceUnavailable`, `+dialogReset`; `/new` в `LINKED_COMMANDS` |
| `BotApiClient` / `BotMessengerPort` (telegram, existing, изменяется) | infrastructure | `+getFile`, `+downloadFile`, `+sendChatAction`; при 400 «can't parse entities» повтор без `parse_mode` |
| `ResetTelegramDialogUseCase` (assistant, new) | application | `findTelegram` → `registry.cancel` → `threads.deleteThread` → `sessions.delete`; экспортируется из `AssistantModule` |
| `ChatSessionRepositoryPort` / `ChatSessionRepository` (assistant, existing, изменяется) | domain port / infrastructure | `+findTelegram(ownerId)` без создания |
| `TasksAgentCapability` (tasks, existing, изменяется) | interface/agent | Промпт с текущей датой МСК на каждый запуск, skills-middleware со скиллом `task-creation` (или запасной `read_skill`) |
| `buildTasksAgentPrompt` (tasks, existing, изменяется) | interface/agent | Принимает `now`; правило создания ссылается на скилл |
| skill `task-creation` (tasks, new) | interface/agent (data) | `skills/task-creation/SKILL.md`: поля, порядок, карточка, подтверждение, правка, отмена, повтор, даты |

### Method Signatures (ключевые, по каждому сервису)
| Service.Method | Params | Returns | Краткое описание |
|---|---|---|---|
| `TranscriberPort.transcribe` | `clip: VoiceClip`, `signal: AbortSignal` | `Promise<TranscriptionResult>` | Вызов провайдера без проверки лимитов |
| `TranscribeVoiceUseCase.execute` | `clip: VoiceClip` | `Promise<TranscriptionResult>` | Лимиты, таймаут 30 с, сбой → `rejected` |
| `BotApiClient.getFile` | `fileId: string` | `Promise<{ filePath: string; fileSize: number \| null }>` | Bot API `getFile` |
| `BotApiClient.downloadFile` | `filePath: string` | `Promise<Buffer>` | Файл с файлового сервера Bot API |
| `BotMessengerPort.sendChatAction` | `chatId: bigint`, `action: 'typing'` | `Promise<void>` | Индикатор «печатает…» |
| `ChatWorkQueue.tryRun` | `chatId: bigint`, `work: (isCurrent: () => boolean) => Promise<void>` | `boolean` | `false`, если для чата уже идёт работа |
| `ChatWorkQueue.resetGeneration` | `chatId: bigint` | `void` | Для `/new`: результат текущей работы больше не отправляется |
| `VoiceMessageHandler.transcribe` | `voice: MessageContent` | `Promise<{ kind: 'text'; text: string } \| { kind: 'reply'; text: string }>` | Текст для агента или готовый ответ с причиной отказа |
| `FreeTextHandlerPort.handle` | `sender: LinkedBotSender`, `text: string` | `Promise<string[]>` | Было `Promise<string>` |
| `splitTelegramMessage` | `html: string`, `limit = 4096` | `string[]` | Нарезка без потери текста |
| `ResetTelegramDialogUseCase.execute` | `ownerId: string` | `Promise<void>` | Идемпотентно: без диалога ничего не делает |
| `ChatSessionRepositoryPort.findTelegram` | `ownerId: string` | `Promise<ChatSession \| null>` | Telegram-диалог владельца, если есть |
| `buildTasksAgentPrompt` | `now: Date` | `string` | Строка «Сейчас: …, Europe/Moscow» и ссылка на скилл |
| `TasksAgentCapability.buildAgent` | `ctx: AgentRunContext`, `options?: BuildAgentOptions` | `CapabilityAgent` | `createAgent({ model, tools, systemPrompt: buildTasksAgentPrompt(clock.now()), middleware: [skills], checkpointer? })` |

---

## Frontend — UI Model

Изменений во frontend нет: control-center и manager-helper не меняются. Подтверждение задачи в приложениях идёт текстом в существующем чате, через оркестратор профиля `app`. Голосовой ввод в клиентах вне скоупа.

### Pages
| Page | Route | Структура (ui / +model / +mediator) | Назначение |
|---|---|---|---|
| — | — | — | Нет новых и изменённых страниц |

### Features (переиспользуемые модули с бизнес-логикой)
| Feature | Статус (new/existing) | Публичный API (index.ts) | model/ (хуки, api.ts) | Назначение |
|---|---|---|---|---|
| — | — | — | — | — |

### UI-компоненты (page-local и shared)
| Component | Слой (pages/<Page>/ui · shared/ui-kit · shared/ui legacy) | Props (основные) | Назначение |
|---|---|---|---|
| — | — | — | — |

### Hooks (model)
| Hook | Расположение | Тип (state-хук / query options factory) | Возвращает |
|---|---|---|---|
| — | — | — | — |

### Паттерны, которые нужно учесть при проектировании
Неприменимо: изменений во frontend нет.

---

## Diagrams

### 1. Domain Entity Interaction
`IncomingMessage` → `MessageContent` → `VoiceClip` → `TranscriptionResult`; `BotCommand` с `new`; `TelegramLink` → `ChatSession` (канал `telegram`, один на владельца) → `AgentRunContext` → `Task`; скилл `task-creation` ведёт к созданию задачи через карточку.

Miro link: https://miro.com/app/board/uXjVEP6UhAI=/?moveToWidget=3458764690155295564

### 2. External Modules Interaction
Telegram Bot API ↔ `telegram` → `transcription` → OpenRouter (audio); `telegram` → `assistant` (`AskInTelegramUseCase`, `ResetTelegramDialogUseCase`) → возможности `tasks` (профиль `telegram`) и `sheets-qa` (профиль `app`) через контракт `shared/agent-capability`; `assistant` → модели и Postgres; `tasks` → Postgres.

Miro link: https://miro.com/app/board/uXjVEP6UhAI=/?moveToWidget=3458764690155295565

### 3. Layer Interaction — от Controller до Response
Голосовое → диспетчер (дедупликация, отправитель, разбор) → ветка «чат занят» или `ChatWorkQueue` с немедленным 200 → «печатает…» → скачивание и расшифровка (ветки отказа) → «Распознал: …» → `AssistantFreeTextHandler` → `AskInTelegramUseCase` → агент задач: сначала карточка, после подтверждения `create_task` → `CreateTaskUseCase` (задача и outbox в транзакции) → ответ частями, если поколение чата не сменилось.

Miro link: https://miro.com/app/board/uXjVEP6UhAI=/?moveToWidget=3458764690155295566

---

## Confirmation Checklist
- [ ] Названия entity/aggregate/VO согласованы
- [ ] Названия и сигнатуры ключевых методов сервисов согласованы
- [ ] Слои (pages/features/kernel/shared), структура model/ui и паттерны фронта согласованы (неприменимо: фронт не меняется)
- [ ] Диаграммы взаимодействия отражают ожидаемую реализацию
- [ ] Пользователь подтвердил переход к tasks.md
