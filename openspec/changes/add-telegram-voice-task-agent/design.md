## Context

Мотивация — в proposal.md. Изменение строится поверх `add-assistant-module`. Его design (раздел Non-Goals) прямо передаёт сюда фоновую обработку Telegram, голос и `/new`.

Что уже есть после `add-assistant-module`:

- **`assistant`** владеет чатами, запуском агента, checkpointer'ом и реестром активных запусков (один запуск на thread, в памяти процесса).
  - `AgentProfileFactory` собирает агента по клиенту. `app` — оркестратор на deepagents с подагентами-возможностями `sheets_qa` (`isolated`) и `tasks` (`fork`). `telegram` — только `TasksAgentCapability.buildAgent(ctx, { checkpointer })`.
  - `AskInTelegramUseCase.execute(ownerId, text) → string` синхронно ведёт запуск и всегда возвращает текст: ответ, «подождите», «слишком длинное» или «не удалось».
  - У владельца один Telegram-диалог: `findOrCreateTelegram`, частичный уникальный индекс `chat_session_owner_telegram_key`.
  - `DeleteChatSessionUseCase` показывает правильный порядок удаления: `registry.cancel` → `threads.deleteThread` → `sessions.delete`.
- **`tasks/interface/agent`**: `TasksAgentCapability` (langchain `createAgent`, без deepagents), `createTaskTools(deps, ctx)` с инструментами `create_task`, `search_tasks`, `find_users`, `update_task`; `actor` берётся из `AgentRunContext`. Промпт `buildTasksAgentPrompt()` статичный: текущей даты нет, на относительный срок агент переспрашивает. Задача создаётся сразу, как только есть заголовок.
- **`telegram`**: `BotUpdateDispatcher` разбирает только `message.text` и синхронно ждёт `FreeTextHandlerPort.handle` → `AssistantFreeTextHandler`. Тот экранирует HTML и обрезает ответ до одного сообщения. Webhook-контроллер ждёт `dispatch()`, polling обрабатывает обновления последовательно.
- **`shared/llm/createChatModel`**: общая фабрика моделей OpenRouter и omniroute.
- **Транскрибация**: только бенчмарк `modules/transcription-module/transcribe-bench.mjs`. `gemini-3.1-flash-lite` через OpenRouter `/chat/completions` с `input_audio` обрабатывает 90 с аудио примерно за 2,5 с.
- **deepagents 1.16.2** экспортирует `createSkillsMiddleware` (`SKILL.md` с frontmatter, источники через backend).

## Goals / Non-Goals

**Goals:**
- Голос в Telegram, переиспользующий тот же путь до агента, что и текст.
- Webhook не ждёт агента, пользователь видит «печатает…».
- Подтверждение перед созданием задачи в одном месте — внутри возможности `tasks`, одинаково для `app` и `telegram`.
- Ни одной новой миграции.

**Non-Goals:**
- Надёжная очередь (BullMQ): потеря сообщения при рестарте допустима.
- HITL-прерывания и inline-кнопки.
- Транскрибация для HTTP-клиентов: модуль готов к этому, эндпоинта нет.

## Decisions

### 1. Модуль `transcription`
Существующая папка `modules/transcription-module` переименовывается в `modules/transcription`, бенчмарк переезжает в `bench/`.

Модуль экспортирует `TranscribeVoiceUseCase.execute(clip: VoiceClip) → TranscriptionResult`:
- `text` — расшифровка;
- `no-speech` — речи нет;
- `rejected` с причиной `too-long | too-large | unsupported-format | provider-unavailable`.

Лимиты (3 мин по `voice.duration` из Telegram, 5 МБ) проверяются до вызова провайдера. Таймаут 30 с.

Адаптер `OpenRouterTranscriber` реализует `TranscriberPort` и повторяет вызов из бенчмарка: `input_audio`, `format: 'ogg'`, промпт «дословно, без комментариев». Модель берётся из `TRANSCRIPTION_MODEL` (по умолчанию `google/gemini-3.1-flash-lite`), ключ — `OPENROUTER_API_KEY`. Пустой ответ или служебная фраза дают `no-speech`. В лог пишутся длительность, размер и исход, но не аудио и не текст.

- *Почему не `shared/llm`:* там фабрика `ChatOpenAI` для LangChain, а аудио в `input_audio` проще и прозрачнее отправить прямым `fetch`, как в бенчмарке.
- *Запасной вариант:* если `ogg` не принимается, внутри адаптера добавляется перекодирование `ffmpeg` в mp3, а в Docker-образ — `ffmpeg`. Порт при этом не меняется. Это проверяется первой задачей реализации.

### 2. Telegram: разбор типов сообщений
`privateTextMessageSchema` заменяется схемой личного сообщения с вариантами:
- `text`;
- `voice` (`file_id`, `duration`, `mime_type`, `file_size`);
- `unsupported` — любое другое содержимое: фото, документ, стикер, видео, кружок, аудиофайл.

`IncomingMessage.text` заменяется на `content: MessageContent`. Команды парсятся только из `text`. Непривязанный отправитель получает прежний ответ для любого типа, голос при этом не скачивается. `BotApiClient` получает `getFile(fileId)`, `downloadFile(filePath)` и `sendChatAction(chatId, 'typing')`.

### 3. Фоновая обработка: `ChatWorkQueue` в `telegram`
Для привязанного отправителя с `text` (не командой) или `voice` диспетчер вызывает `queue.tryRun(chatId, work)`:
- если для `chatId` уже идёт работа, бот сразу отвечает `BotReplies.stillProcessing()`;
- иначе работа запускается без `await`, и `dispatch` возвращает `handled`.

Работа:
1. включает `typing` и повторяет его каждые 4 с, пока работа идёт;
2. для `voice` скачивает файл, расшифровывает, отправляет «Распознал: …» или текст отказа и останавливается при отказе;
3. вызывает `FreeTextHandlerPort.handle(sender, text)` и отправляет полученные части.

Ошибки работы логируются, пользователю уходит `TELEGRAM_FAILED_MESSAGE`. Команды идут мимо очереди, как раньше.

- `AskInTelegramUseCase` сохраняет собственную защиту «подождите» через реестр запусков. Очередь — первая линия защиты (сюда же попадает время расшифровки), реестр — вторая.
- *Почему не BullMQ:* скорость. Риск записан ниже.

### 4. Нарезка ответа
`FreeTextHandlerPort.handle` возвращает `string[]` вместо `string`. `AssistantFreeTextHandler` экранирует ответ, затем `splitTelegramMessage` режет его на части ≤ 4096 символов по абзацам, иначе по строкам, иначе жёстко; обрезка `…` уходит. Если Telegram отвечает 400 «can't parse entities», `BotMessenger` повторяет эту часть без `parse_mode`.

### 5. `/new`: сброс Telegram-диалога
- В `BotCommand` добавляется `new`, в `LINKED_COMMANDS` — строка «/new — начать новый диалог».
- `assistant` получает `ResetTelegramDialogUseCase.execute(ownerId)`: `sessions.findTelegram(ownerId)` (новый метод порта, без создания); если диалог есть — `registry.cancel(id)` → `threads.deleteThread(id)` → `sessions.delete(id, ownerId)`. `AssistantModule` экспортирует его вместе с `AskInTelegramUseCase`.
- Следующее сообщение создаёт новый диалог через существующий `findOrCreateTelegram`. Уникальный индекс не мешает: старая строка уже удалена.
- Отмена запуска через `/new` заставляет `AskInTelegramUseCase` вернуть «не удалось обработать». Чтобы пользователь не увидел этот текст после сброса, `ChatWorkQueue` хранит поколение чата: `/new` его увеличивает, а результат работы со старым поколением не отправляется.

- *Альтернатива:* несколько Telegram-сессий и флаг `is_current`. Отклонено: нужна миграция и смена уникального индекса, а история старого диалога в Telegram никому не нужна.

### 6. Скилл `task-creation` внутри возможности `tasks`
Файл `tasks/interface/agent/skills/task-creation/SKILL.md`. Frontmatter: `name`, `description` «использовать, когда пользователь просит создать задачу». Тело:
- поля и ограничения из `task-management`;
- порядок: извлечь поля → разрешить людей через `find_users` → одним сообщением предложить недостающие необязательные поля → карточка → ждать явного «да» → `create_task` → итог;
- формат карточки (ответственный и наблюдатели по логину, срок датой и временем МСК);
- что считается подтверждением, правкой и отменой;
- правило «не создавать повторно, если в истории уже есть успешный `create_task` по этой карточке».

`TasksAgentCapability.buildAgent` передаёт в `createAgent` `middleware: [createSkillsMiddleware({ backend, sources: ['/skills/'] })]`. `backend` — `FilesystemBackend`, указывающий только на папку `skills` возможности и открытый только на чтение.

- В промпте агента задач правило 1 («создавай, как только есть заголовок») заменяется ссылкой на скилл: «прежде чем создавать задачу, следуй скиллу task-creation».
- *Проверка до реализации:* спайк — работает ли skills-middleware deepagents в `createAgent` из langchain и какой инструмент чтения файла он даёт модели. Если middleware требует filesystem-middleware со всеми инструментами записи, его не подключаем. Вместо этого добавляем собственный инструмент `read_skill({ name })`, который возвращает текст `SKILL.md`, а описание скиллов кладём в промпт. Поведение по спекам одинаковое в обоих вариантах.
- *Почему скилл, а не HITL:* решение пользователя. Подтверждение держится на инструкции, отдельный механизм прерываний не нужен.
- В профиле `app` подтверждение проходит через оркестратор. Подагент `tasks` (`fork`) возвращает карточку как уточняющий вопрос, оркестратор пересказывает её (это уже есть в его промпте). Следующую реплику «да» оркестратор снова отдаёт `tasks`, и тот видит карточку в форке контекста. Сценарий проверяется тестом на сборку профиля и ручным прогоном.

### 7. Текущая дата в промпте агента задач
`buildTasksAgentPrompt(now: Date)` добавляет строку «Сейчас: <день недели>, <дата> <время>, Europe/Moscow (UTC+3)». `TasksAgentCapability` получает `Clock` (порт уже есть в `tasks/domain/ports`) и строит промпт на каждый запуск в `buildAgent`. Агент собирается на каждый запуск, поэтому дата всегда свежая. Срок без времени ставится на 18:00 МСК (правило в скилле).

## Risks / Trade-offs

- [Модель создаёт задачу без подтверждения: подтверждение держится на скилле] → явные правила в скилле, тест-сценарии на «нет», «отмена» и молчание; в ответе всегда называется результат. Если нарушения появятся, следующий шаг — HITL.
- [Повторное «да» может создать дубль] → правило в скилле опирается на историю (`create_task` с `created: true`); в Telegram история хранится checkpointer'ом, в `app` её видит форк. Если этого окажется мало, дубли можно закрыть идемпотентностью в инструменте.
- [Подтверждение в `app` идёт через оркестратор, который может пересказать карточку неточно] → в промпте оркестратора уже есть «перескажи как есть»; добавляется ручная проверка сценария.
- [Skills-middleware несовместим с `createAgent`] → спайк первой задачей, запасной вариант — `read_skill`.
- [Сообщение теряется при рестарте во время фоновой работы] → редкий случай, пользователь повторит. Позже можно перейти на BullMQ.
- [Gemini не принимает `ogg`] → спайк первой задачей, запасной вариант — `ffmpeg`.
- [Исполнитель ищется только по логину: «Петя» может не совпасть с `p.ivanov`] → `find_users` уже требует уточнять при неоднозначности, логин показывается в карточке. ФИО — отдельное изменение.

## Migration Plan

1. Заархивировать `add-assistant-module`, чтобы `telegram-assistant-chat` и `task-agent-tools` попали в основные спеки.
2. Задеплоить backend. Миграций нет. Задать `TRANSCRIPTION_MODEL` (необязательно) и проверить `OPENROUTER_API_KEY`.
3. Проверить на стенде в polling: текст, голос, длинный ответ, `/new` во время ответа, создание задачи с подтверждением в Telegram и в приложении.

Откат: вернуть предыдущую версию backend. Данные не меняются, Telegram-диалоги, удалённые через `/new`, не восстанавливаются.
