# Architecture: client-ui-design-parity

## Scope
Бэкенд: модуль `transcription` (HTTP-расшифровка голоса) и модуль `assistant` (перезапуск ответа с сообщения, id сохранённого вопроса, длительность вызовов), перенос `ClientAppGuard` в `shared/http`. Клиенты: пакет `ui-kit/` (новые компоненты и правки по макетам) и тонкие контейнеры `control-center/src/renderer/src`, `control-center/src/main`, `manager-helper/src`. Макеты: `design/synergy-design.pen`, `design/design-kit.lib.pen`.

---

## Backend — Domain Model

### Entities
| Name | Status | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `ChatSession` | existing | да | id, ownerId, title, titleIsCustom, lastActivityAt | Чат; правило одного активного запуска — через `ActiveRunRegistryPort` |
| `ChatMessage` | existing (поля new) | нет | id (bigserial, порядок), role, text, attachments, source, toolCalls; **new:** `agentCheckpointId: string \| null`, `rewindable: boolean` | Сообщение; у вопроса — точка отката контекста агента |

### Aggregates
| Aggregate | Root entity | Входит в состав | Инварианты |
|---|---|---|---|
| ChatSession | `ChatSession` | `ChatMessage`, `MessageAttachment` | Перезапуск только с вопроса этого чата и только с `rewindable = true`; удаление хвоста и запись нового вопроса — одна транзакция; при активном запуске перезапуск запрещён |

### Value Objects
| Name | Поля | Почему VO |
|---|---|---|
| `RewindPoint` (new) | messageId, attachments: readonly string[], checkpointId: string \| null | Неизменяемый снимок точки перезапуска, читается до транзакции — `backend/src/modules/assistant/domain/rewind-point.ts` |
| `ToolCallTrace` (existing, расширяется) | name, args, **durationMs?: number** | Запись трассировки — `backend/src/modules/assistant/domain/tool-call-trace.ts` |
| `RunInput` (existing, расширяется) | threadId, runId, question, attachments, **replaceFromMessageId?: string** | Самопроверяемый ввод запуска — `backend/src/modules/assistant/domain/run-input.ts` |
| `AgentEvent` (existing, расширяется) | + `{ type: 'user-message-saved'; messageId }` | Доменное событие потока — `backend/src/modules/assistant/domain/agent-event.ts` |
| `VoiceClip` (existing) | audio, mimeType, durationSec | Без изменений; длительность теперь серверная — `backend/src/modules/transcription/domain/voice-clip.ts` |
| `NormalizedVoiceAudio` (new) | audio: Buffer (ogg/opus), durationSec | Результат нормализации — `backend/src/modules/transcription/domain/normalized-voice-audio.ts` |
| `VoiceRateDecision` (new) | allowed: boolean, retryAfterSec | Результат проверки лимита — в файле порта лимита |

### Services
| Service | Слой | Файл | Ответственность |
|---|---|---|---|
| `VoiceAudioNormalizerPort` | domain (port) | `backend/src/modules/transcription/domain/ports/voice-audio-normalizer.port.ts` | Длительность по потоку и перекодирование в ogg/opus |
| `FfmpegVoiceAudioNormalizer` | infrastructure | `backend/src/modules/transcription/infrastructure/ffmpeg/ffmpeg-voice-audio-normalizer.ts` | ffprobe + ffmpeg, таймаут, `-threads 1`, отмена по signal |
| `VoiceRateLimiterPort` | domain (port) | `backend/src/modules/transcription/domain/ports/voice-rate-limiter.port.ts` | Лимит запросов на пользователя в минуту |
| `RedisVoiceRateLimiter` | infrastructure | `backend/src/modules/transcription/infrastructure/redis/redis-voice-rate-limiter.ts` | `INCR` + `PEXPIRE`, fail-open |
| `TranscribeUploadedVoiceUseCase` | application | `backend/src/modules/transcription/application/transcribe-uploaded-voice.use-case.ts` | Лимит → нормализация → `VoiceClip` → `TranscribeVoiceUseCase` |
| `TranscribeVoiceUseCase` | application (existing) | `backend/src/modules/transcription/application/transcribe-voice.use-case.ts` | Без изменений |
| `VoiceTranscriptionsController` | interface | `backend/src/modules/transcription/interface/http/voice-transcriptions.controller.ts` | `POST /transcriptions/voice`, busboy, коды ошибок |
| `ClientAppGuard` | interface (перенос) | `backend/src/shared/http/client-app.guard.ts` (из `assistant/interface/http/`) | Только приложения CC и MH |
| `StartAgentRunUseCase` | application (existing) | `backend/src/modules/assistant/application/start-agent-run.use-case.ts` | Ветка `replaceFromMessageId`: точка → транзакция → запуск с форком; событие `user-message-saved` |
| `ChatSessionRepositoryPort` / `ChatSessionRepository` | domain port / infrastructure (existing) | `.../assistant/domain/ports/chat-session-repository.port.ts`, `.../assistant/infrastructure/chat-session-repository.ts` | new: `findRewindPoint`, `replaceFrom`; `appendUserMessage` пишет точку отката |
| `ChatThreadPort` / `ChatThread` | domain port / infrastructure (existing) | `.../assistant/domain/ports/chat-thread.port.ts`, `.../assistant/infrastructure/chat-thread.ts` | new: `latestCheckpointId` |
| `AgentRunnerPort` / `agent-runner.ts` | domain port / infrastructure (existing) | `.../assistant/domain/ports/agent-runner.port.ts`, `.../assistant/infrastructure/agent-runner.ts` | `AgentRunScope.fromCheckpointId` → `configurable.checkpoint_id` |
| `collect-tool-calls.ts` | infrastructure (existing) | `.../assistant/infrastructure/collect-tool-calls.ts` | Замер `durationMs` вызова |
| `AgUiEventMapper` | interface (existing) | `.../assistant/interface/http/ag-ui-event-mapper.ts` | CUSTOM `user-message-saved` |
| `AgentController` | interface (existing) | `.../assistant/interface/http/agent.controller.ts` | `forwardedProps.replaceFromMessageId` (id сообщения строкой, как в истории), 404 / 409 / 422 |
| `thread-message-mapper.ts` / `thread-history.response.ts` | interface (existing) | `.../assistant/interface/http/` | `editable` у вопроса, `durationMs` у вызова |
| Миграция | infrastructure | `backend/db/migrations/NNN_chat_message_rewind.sql` (следующий номер) + `backend/src/database/postgres/chat-message-rewind-migration.spec.ts` | `agent_checkpoint_id TEXT NULL`, `rewindable BOOLEAN NOT NULL DEFAULT false` |
| Ошибки | domain | `.../assistant/domain/message-not-found.error.ts`, `.../assistant/domain/message-not-rewindable.error.ts` | 404 и 422 `MESSAGE_NOT_EDITABLE` |

### Method Signatures
| Service.Method | Params | Returns | Описание |
|---|---|---|---|
| `VoiceAudioNormalizerPort.normalize` | audio: Buffer, mimeType: string, signal: AbortSignal | `Promise<NormalizedVoiceAudio>` | Выбрасывает `UnsupportedVoiceAudioError`, если ffprobe не прочитал запись; длительность всегда серверная |
| `VoiceRateLimiterPort.acquire` | userId: string | `Promise<VoiceRateDecision>` | Считает запрос; при недоступном Redis — `allowed: true` |
| `TranscribeUploadedVoiceUseCase.execute` | `{ userId, audio, mimeType }`, signal | `Promise<TranscriptionResult \| { kind: 'rate-limited', retryAfterSec }>` | Ошибки — результатом, как у `TranscribeVoiceUseCase` |
| `VoiceTranscriptionsController.transcribe` | user, req (multipart `audio`), res | 200 `{kind,text?}` / 400 / 413 / 415 / 429 / 503 | Маппинг результатов на коды из design E2 |
| `ChatSessionRepositoryPort.appendUserMessage` | sessionId, ownerId, text, attachments, **rewind: { checkpointId: string \| null }** | `Promise<ChatMessage>` | Пишет `rewindable = true` и точку |
| `ChatSessionRepositoryPort.findRewindPoint` | sessionId, ownerId, messageId | `Promise<RewindPoint>` | `MessageNotFoundError` / `MessageNotRewindableError` |
| `ChatSessionRepositoryPort.replaceFrom` | sessionId, ownerId, messageId, `{ text, attachments, checkpointId }` | `Promise<ChatMessage>` | Одна транзакция: `DELETE … id >= messageId` + вставка вопроса + `lastActivityAt` |
| `ChatThreadPort.latestCheckpointId` | sessionId | `Promise<string \| null>` | Id последнего чекпоинта главного графа (`checkpoint_ns = ''`) |
| `StartAgentRunUseCase.execute` | ownerId, `{ threadId, runId, question, fileIds?, replaceFromMessageId? }`, observer, client | `Promise<AgentRun>` | 409 до записи; для замены — `findRewindPoint` → `replaceFrom` → (`deleteThread`, если точка пуста) → `drive` с `fromCheckpointId` |
| `AgentRunnerPort.stream` | input: RunInput, signal, scope: `AgentRunScope & { fromCheckpointId?: string }` | `AsyncIterable<AgentEvent>` | Форк от чекпоинта |
| `RunObserver.next` | `AgentEvent.userMessageSaved(messageId)` | void | Первое событие после сохранения вопроса |

---

## Frontend — UI Model

Структура та же, что в `unified-client-ui`: презентационные компоненты и чистые функции в `ui-kit/src/<область>/`, публичный API — `ui-kit/src/index.ts` и `ui-kit/src/icons.ts`; данные, транспорт и платформа — в контейнерах приложений. Роутинга нет, «страница» — экран раздела.

### Pages
| Page | Route | Структура | Что меняется |
|---|---|---|---|
| ChatsScreen (CC) | `section = 'chats'` | `control-center/src/renderer/src/features/chat/ChatsScreen.tsx` → `ChatThread.tsx`, `ChatListContainer.tsx`, `ChatRuntimeProvider.tsx` | `ThreadWelcome` вместо `NoChat`, голос, правка и повтор, соединение, поиск и меню шапки, ⌘K, тосты |
| TasksScreen (CC) | `section = 'tasks'` | `features/tasks/*` | `DeadlinePicker`, `TaskSearchEmpty`, `TaskDeleteConfirm` и тост, «Загрузка…» в капсуле, Ctrl+Enter |
| AppShell / AuthGate (CC) | — | `layouts/AppShell.tsx`, `features/auth/*`, `features/notifications/*`, `features/telegram/*` | Баннер соединения уведомлений по IPC, иконки типов, QR, «Пароль изменён», 429, текст ошибки временного пароля |
| Main (CC) | — | `control-center/src/main/index.ts`, `src/main/notifications/*` | Обработчики разрешения `media`; IPC `notifications:connection` |
| ChatPane (MH) | `active-section = 'chats'` | `manager-helper/src/sidepanel/ChatPane.tsx` → `ThreadView.tsx`, `ChatRuntimeProvider.tsx` | Кнопка «Подбор» и шторка вместо формы в ленте, `ThreadWelcome`, голос, правка и повтор, соединение, поиск и меню |
| TasksApp (MH) | `active-section = 'tasks'` | `manager-helper/src/sidepanel/tasks/*` | Группы по сроку, мобильный поиск, `TaskCreateDialog` на планшете, «Закрыть», `TaskQuickCreateSheet` с вложенными шторками |
| NotificationsOverlay (MH) | — | `sidepanel/notifications/*`, `background/notifications/panel-port-hub.ts` | Состояние сокета в панели, группы, иконки, цель «чат», мобильная шапка |
| MicPermissionPage (MH, new) | `mic-permission.html` | `manager-helper/src/mic-permission/{index.html,main.tsx,MicPermissionPage.tsx}` | Разовый запрос доступа к микрофону |

### Features (модули пакета)
| Feature | Статус | Публичный API | Логика / model | Назначение |
|---|---|---|---|---|
| `ui-kit/src/primitives` | existing | + `Toast`, `ToastProvider`, `useToast`, `Calendar`; `Sheet` (+`grabber`, `title?`); `Button` (радиус 16); `Menu` (радиус 20) | — | Базовые элементы |
| `ui-kit/src/chat` | existing | + `ThreadWelcome`, `WELCOME_SUGGESTIONS`, `UserActionBar`, `EditComposer`, `ConnectionBanner`, `ChatSearchBar`, `ChatHeaderMenu`, `VoiceRecorderBar`; `Composer` (+`tools`, голос, `disabled` с плейсхолдером); `ToolGroup` (заголовок, авто-раскрытие, длительность); `RunNotice` (вариант «остановлен») | `tool-status.ts` (`groupSummary` со счётчиками), `format-duration.ts`, `chat-search.ts` | Чат |
| `ui-kit/src/chat/voice` | new | `useVoiceInput`, тип `VoiceTranscriptionPort`, `VoiceError` | `use-voice-input.ts`, `voice-level.ts` | Запись, автостоп, уровень, расшифровка через порт |
| `ui-kit/src/chat/restart` | new | `withReplaceFrom`, `useServerMessageIds`, `USER_MESSAGE_SAVED_EVENT` | `with-replace-from.ts`, `use-server-message-ids.ts` | Правка и повтор без дубля |
| `ui-kit/src/chat/connection` | new | `useServerReachability` | `use-server-reachability.ts`, `is-network-error.ts` | Определение потери связи |
| `ui-kit/src/chat/chat-list` | existing | `ChatListItem` (меню «…»), `ChatList` (⌘K, тексты состояний) | `use-search-shortcut.ts` | Список чатов |
| `ui-kit/src/tasks` | existing | + `DeadlinePicker`, `TaskSearchEmpty`, `MobileSearchBar`, `TaskDeleteConfirm`; `TaskList` (группы), `UserPicker` (счётчики) | `deadline.ts` (+`groupByDeadline`, `quickDeadline`) | Задачи |
| `ui-kit/src/notifications` | existing | `NotificationsList` (+`connection`, группы), `notificationIcon`, `groupByDay` (перенос `groupOf` из CC) | `notification-icon.ts`, `group-by-day.ts` | Уведомления |
| `ui-kit/src/telegram` | existing | `TelegramConnectPanel` (+QR, чип), `TelegramNotConfiguredPanel` (перенос) | `qr.ts` (обёртка `qrcode`) | Telegram |
| `ui-kit/src/auth` | existing | `AuthAlert` (`title`, `hint`), `RateLimitBlock`, `PasswordChangedScreen` | `format-countdown.ts` | Авторизация |

### UI-компоненты (ключевые props)
| Component | Расположение | Props (основные) | Назначение |
|---|---|---|---|
| `ThreadWelcome` | `ui-kit/src/chat/ThreadWelcome.tsx` | `suggestions?` (по умолчанию `WELCOME_SUGGESTIONS`) | Стартовое окно; число карточек по `LayoutMode`; клик → `composer.setText` при пустом поле |
| `UserActionBar` | `ui-kit/src/chat/UserActionBar.tsx` | `canEdit: boolean` | «Копировать» (`ActionBarPrimitive.Copy`), «Изменить» (`ActionBarPrimitive.Edit`) |
| `EditComposer` | `ui-kit/src/chat/EditComposer.tsx` | — | `ComposerPrimitive` в режиме правки, «Отмена» / «Отправить», пометка «будет заменён» у следующего ответа |
| `Composer` | `ui-kit/src/chat/Composer.tsx` | `attachments`, `voice?: ReturnType<useVoiceInput>`, `tools?: ReactNode`, `disabled?`, `disabledHint?` | Форма: «+» (`plus`), слот `tools`, микрофон, отправка / стоп |
| `VoiceRecorderBar` | `ui-kit/src/chat/VoiceRecorderBar.tsx` | `elapsedSec`, `level`, `onStop` | Таймер, волна, «Говорите…», «стоп» (`cBn7j/iJP1F`) |
| `ConnectionBanner` | `ui-kit/src/chat/ConnectionBanner.tsx` | `onRetry`, `retrying`, `hint?` (MH: про настройки) | «Сервер недоступен» (`pUB2g`) |
| `Thread` | `ui-kit/src/chat/Thread.tsx` | + `connection`, `onProbe`, `search?` | Баннер, блокировка поля, поиск |
| `RunNotice` | `ui-kit/src/chat/RunNotice.tsx` | `kind: 'error' \| 'stopped' \| 'conflict'`, `onRetry` | «Ответ остановлен» + пояснение о несохранённой части (`obt14`) |
| `ToolGroup` | `ui-kit/src/chat/ToolGroup.tsx` | `calls: ToolCallView[]` (+`durationMs?`, `error?`), `running` | Заголовок со счётчиками, авто-раскрытие, `circle-x` + текст ошибки |
| `ChatSearchBar` | `ui-kit/src/chat/ChatSearchBar.tsx` | `open`, `onClose` | Поиск по сообщениям, «N из M», переходы |
| `ChatHeaderMenu` | `ui-kit/src/chat/ChatHeaderMenu.tsx` | `onRename`, `onDelete`, `disabled` | Меню «…» в шапке |
| `ChatListItem` | `ui-kit/src/chat/chat-list/ChatListItem.tsx` | `onRename`, `onDelete` (без inline-ошибки) | Меню «…» строки, подтверждение с `trash-2` |
| `Toast` / `ToastProvider` | `ui-kit/src/primitives/Toast.tsx` | `tone`, `title`, `description?`, `action?`, `persistent?` | Тосты результатов |
| `Sheet` | `ui-kit/src/primitives/Sheet.tsx` | + `grabber?`, `title?`, `aria-label` | Шторки с захватом |
| `DeadlinePicker` | `ui-kit/src/tasks/DeadlinePicker.tsx` | `value: Date \| null`, `onChange`, `onClose` | Быстрые даты, `Calendar`, время, «Без срока», «Готово · …» |
| `TaskDeleteConfirm` | `ui-kit/src/tasks/TaskDeleteConfirm.tsx` | `taskTitle`, `onConfirm`, `onCancel`, `pending` | Диалог или шторка по режиму |
| `TaskSearchEmpty` | `ui-kit/src/tasks/TaskSearchEmpty.tsx` | `onReset` | «Ничего не найдено», «Сбросить фильтры» |
| `MobileSearchBar` | `ui-kit/src/tasks/MobileSearchBar.tsx` | `value`, `onChange`, `onBack` | Мобильный поиск задач |
| `NotificationsList` | `ui-kit/src/notifications/NotificationsList.tsx` | + `connection: 'online' \| 'reconnecting'` | Баннер переподключения, группы |
| `TelegramConnectPanel` | `ui-kit/src/telegram/TelegramConnectPanel.tsx` | + `link` → QR и чип, `onCopy` | QR (`t:se4na`) и чип (`t:R31sI`) |
| `RateLimitBlock` | `ui-kit/src/auth/RateLimitBlock.tsx` | `retryAfterSec`, `onExpire` | 429 с отсчётом (`uTccU`) |
| `PasswordChangedScreen` | `ui-kit/src/auth/PasswordChangedScreen.tsx` | `onContinue` | «Пароль изменён» (`KxBWe`) |
| `QuickSearchButton` | `manager-helper/src/sidepanel/quick-search/QuickSearchButton.tsx` (new) | `onClick`, `disabled` | Пилюля «Подбор» в слоте `tools` (`MpzNH`, `h2cqd`) |
| `QuickSearchSheet` | `manager-helper/src/sidepanel/quick-search/QuickSearchSheet.tsx` (new) | `open`, `value`, `onChange`, `onSubmit(query, title)`, `pending`, `onOpenChange` | Шторка с формой и превью (`B1Cic`…`I5YIoq`) |
| `QuickSearchForm` | `manager-helper/src/sidepanel/QuickSearchForm.tsx` → `sidepanel/quick-search/QuickSearchForm.tsx` | `value`, `onChange` (управляемая) | Поля формы, выбор направлений с лимитом |
| `TaskQuickCreateSheet` | `manager-helper/src/sidepanel/tasks/TaskQuickCreateSheet.tsx` (вместо `TaskCreateSheet.tsx`) | `onCreate`, `me` | Чипы дедлайна и ответственного, вложенные шторки |
| `TaskCreateDialog` (MH) | `manager-helper/src/sidepanel/tasks/TaskCreateDialog.tsx` (new) | `onCreate` | Создание на планшете |

### Hooks (model)
| Hook | Расположение | Тип | Возвращает |
|---|---|---|---|
| `useVoiceInput` | `ui-kit/src/chat/voice/use-voice-input.ts` | state-хук с портом `VoiceTranscriptionPort` | `{ state, elapsedSec, level, error, start, stop, cancel }` |
| `useServerMessageIds` | `ui-kit/src/chat/restart/use-server-message-ids.ts` | state-хук | `{ serverIdOf(localId), isEditable(id), onCustomEvent, setFromHistory }` |
| `useServerReachability` | `ui-kit/src/chat/connection/use-server-reachability.ts` | state-хук с `probe` | `{ connection, reportError, retry, retrying }` |
| `useSearchShortcut` | `ui-kit/src/chat/chat-list/use-search-shortcut.ts` | эффект-хук | — (⌘K / Ctrl+K → фокус) |
| `useToast` | `ui-kit/src/primitives/Toast.tsx` | контекст | `show(toast)`, `dismiss(id)` |
| CC: `useVoiceTranscriptionPort` | `control-center/src/renderer/src/features/chat/use-voice-transcription-port.ts` (new) | адаптер | порт поверх `cc-api://backend/transcriptions/voice` |
| CC: `restartFrom` / `withReplaceFrom` | `control-center/src/renderer/src/features/chat/ChatRuntimeProvider.tsx` | подключение обёртки | агент с `replaceFromMessageId` |
| CC: `useNotificationsConnection` | `control-center/src/renderer/src/features/notifications/use-notifications-connection.ts` (new) | IPC-подписка | `'online' \| 'reconnecting'` |
| CC: `media-permissions.ts` | `control-center/src/main/media-permissions.ts` (new) | main-процесс | обработчики разрешений |
| MH: `useVoiceTranscriptionPort` | `manager-helper/src/sidepanel/voice/use-voice-transcription-port.ts` (new) | адаптер | порт поверх `authFetch` + `ensureMicrophoneAccess` (вкладка `mic-permission.html`) |
| MH: `transcribeVoice` | `manager-helper/src/shared/voice-api.ts` (new) | функция API | `POST /transcriptions/voice` → `VoiceTranscript` / `VoiceError` |
| MH: `useQuickSearchDrafts` | `manager-helper/src/sidepanel/quick-search/use-quick-search-drafts.ts` (new) | state-хук | `[draftOf(threadId), setDraft(threadId, form)]` |
| MH: `useNotificationsConnection` | `manager-helper/src/sidepanel/notifications/use-notifications-connection.ts` (new) | подписка на порт | `'online' \| 'reconnecting'` |
| Удаляются (MH) | `sidepanel/ChatTitleBar.tsx`, `ChatTitleBar.test.tsx`, `form-visibility.ts`, `form-visibility.test.ts` | — | — |

### Паттерны, которые нужно учесть
- [x] Публичный API пакета только через `exports`; глубокие импорты запрещены eslint.
- [x] Запросы к бэкенду — в приложениях (CC `lib/backend/*`, MH `shared/*-api.ts`); пакет получает порты (`VoiceTranscriptionPort`, `probe`) и колбэки.
- [x] Ошибки API нормализуются в приложениях; в пакет приходят коды `VoiceError` и готовые тексты.
- [x] Контейнерные компоненты пакета принимают именованные слоты (`Composer.tools`, `Thread.composer`, `Thread.search`).
- [x] Списки различают первичную загрузку и обновление; баннеры соединения не схлопывают уже показанные данные.
- [x] Цвета, радиусы, тени — только токены UI Kit (новый `--radius-menu`).
- [x] Платформенный код (разрешения микрофона, IPC, `chrome.*`) — только в приложениях.

---

## Diagrams
Как в предыдущих change, диаграммы даны текстом. Доску Miro не создавали.

### 1. Domain Entity Interaction
```
ChatSession 1 ──< ChatMessage (id bigserial, порядок)
                    ├─ role=user: text, attachments[], agent_checkpoint_id?, rewindable
                    └─ role=agent: text, attachments[], source(answer|system), toolCalls[ToolCallTrace{name,args,durationMs?}]
ChatSession.id == LangGraph thread_id ──< checkpoints (ветки: форк от agent_checkpoint_id)
RewindPoint = { messageId, attachments, checkpointId } ← читается из ChatMessage(role=user, rewindable)

transcription: multipart audio ─► NormalizedVoiceAudio{ogg, durationSec} ─► VoiceClip ─► TranscriptionResult(text|no-speech|rejected)
```

### 2. External Modules Interaction
```
CC renderer ──cc-api://──► CC main ──HTTP──┐
MH sidepanel ──authFetch──────────────────┼──► backend
                                          │     ├─ POST /transcriptions/voice ─► transcription ─► ffmpeg/ffprobe (процесс)
                                          │     │                                  ├─► Redis (лимит частоты)
                                          │     │                                  └─► OpenRouter input_audio (sync, ≤30 с)
                                          │     ├─ POST /agent (SSE AG-UI, replaceFromMessageId) ─► assistant
                                          │     │        ├─► Postgres chat_message (транзакция обрезки)
                                          │     │        └─► LangGraph PostgresSaver (форк чекпоинта) ─► LLM
                                          │     ├─ GET /threads/:id/messages (editable, durationMs)
                                          │     └─ GET /health (проверка связи)
CC main: session permission handler (media) ; socket уведомлений ─IPC─► renderer (connection)
MH: mic-permission.html (getUserMedia один раз) ; service worker socket ─port─► sidepanel (connectionState)
```

### 3. Layer Interaction — от Controller до Response
Голос:
```
VoiceTranscriptionsController (busboy, fileSize ≤ 5 МБ → 413; нет поля → 400; req.close → abort)
  └─► TranscribeUploadedVoiceUseCase
        ├─ VoiceRateLimiterPort.acquire(userId) ── deny ─► 429 VOICE_RATE_LIMITED + Retry-After
        ├─ VoiceAudioNormalizerPort.normalize ── UnsupportedVoiceAudioError ─► 415
        ├─ VoiceClip.of({ogg, durationSec серверная})
        └─ TranscribeVoiceUseCase.execute ─► text|no-speech ─► 200
                                          └► rejected(too-long ─► 413 VOICE_TOO_LONG | provider-unavailable ─► 503)
```
Перезапуск:
```
AgentController (forwardedProps.replaceFromMessageId)
  └─► StartAgentRunUseCase.execute
        ├─ RunInput.assertDraft, findAppSession ─► 400 / 404
        ├─ registry.startAfterSystemMessages ─ null ─► 409 (ничего не изменено)
        ├─ sessions.findRewindPoint ─► MessageNotFound 404 | MessageNotRewindable 422 (release реестра)
        ├─ sessions.replaceFrom (TX: DELETE id ≥ X; INSERT вопрос с той же точкой; lastActivityAt)
        ├─ checkpointId == null ? threads.deleteThread : —
        ├─ observer.next(user-message-saved{messageId}) ─► SSE CUSTOM
        └─ drive(run, fromCheckpointId) ─► AgentRunner (configurable.checkpoint_id) ─► SSE события ─► appendAgentAnswer(trace c durationMs)
Обычный запуск: threads.latestCheckpointId ─► appendUserMessage(rewind) ─► user-message-saved ─► drive
```

---

## Confirmation Checklist
- [x] Названия entity/VO согласованы (`RewindPoint`, `NormalizedVoiceAudio`, поля `agent_checkpoint_id` / `rewindable`, `ToolCallTrace.durationMs`)
- [x] Названия и сигнатуры методов согласованы (`findRewindPoint`, `replaceFrom`, `latestCheckpointId`, `VoiceAudioNormalizerPort.normalize`, `VoiceRateLimiterPort.acquire`, `TranscribeUploadedVoiceUseCase.execute`, `VoiceTranscriptionPort`, `withReplaceFrom`)
- [x] Эндпоинты и коды: `POST /transcriptions/voice` (200/400/413/415/429/503), `POST /agent` + `replaceFromMessageId` (404/409/422), CUSTOM `user-message-saved`
- [x] Слои: пакет (порты и компоненты) → контейнеры приложений; быстрый подбор только в MH
- [x] Диаграммы (текстом) отражают ожидаемую реализацию
- [x] Пользователь подтвердил переход к ui-design.md и tasks.md

> Отмечено координатором 2026-11-20 по прямому указанию пользователя в чате: «в любом случае принимай все изменения и пиши tasks как закончит агент и после запускай workflow». Пользователь заранее разрешил принять решения по умолчанию; архитектуру и доску 07 построчно он не просматривал — показать ему в итоге реализации.
