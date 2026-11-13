# Architecture: add-meeting-transcription-agent

## Scope
Изменение затрагивает бэкенд и приложение Electron:
- **бэкенд**:
  - `transcription/meeting`: сегменты в отдельной таблице, имена спикеров, документы, извлечение задач, специалист по встречам, сообщение в чат по готовности;
  - `files`: сохранение файла, созданного на сервере, и проверка вложений;
  - `assistant`: вложения, сообщения системы, событие файла в потоке, третий специалист;
  - `tasks`: инициатор, постановщик, черновик списка задач;
  - `notifications`: два новых типа.
- **Electron** (`control-center`): прикрепление файлов в чате, карточки файлов, обновление открытого чата по уведомлению.

Расширение и Telegram не меняются.

---

## Backend — Domain Model

### Entities
| Name | Status (new/existing) | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `MeetingTranscript` (transcription) | existing, меняется | да | `fileId`, `ownerId`, `status`, `failureReason`, `language`, `durationSec`, `speakerCount`, `speakerNames: SpeakerNames`, `attempts`, `completedAt`. **Убирается** `segments` | Расшифровка. Сегменты больше не часть агрегата: их пишут вместе с `complete` и читают отдельным портом |
| `ChatSession` (assistant) | existing | да | без изменений | Чат |
| `ChatMessage` (assistant) | existing, меняется | нет (внутри `ChatSession`) | + `source: 'run' \| 'system'`, `attachments: MessageAttachment[]`, `dedupKey: string \| null` | Сообщение истории для клиента |
| `Task` (tasks) | existing, меняется | да | + `initiatorId` | Задача. `creatorId` — постановщик, `initiatorId` — кто фактически создал |
| `TaskBatchDraft` (tasks) | new | да | `id`, `ownerId`, `threadId`, `items: DraftTaskItem[]`, `origin: DraftOrigin \| null`, `status: draft \| superseded \| consumed`, `result: TaskBatchResult \| null`, `createdAt` | Согласованный с пользователем список задач. Задачи по нему создаются один раз |
| `Notification` (notifications) | existing | да | + тип объекта `chat`, типы `meeting-transcript.ready`, `meeting-transcript.failed`, `task.created-on-behalf` | Уведомление |

### Aggregates
| Aggregate | Root entity | Входит в состав (entities/VO) | Инварианты, которые защищает |
|---|---|---|---|
| `MeetingTranscript` | `MeetingTranscript` | `SpeakerNames`, `SpeakerName` | Прежние переходы статусов. Имена меняются только при `completed`. Номер спикера в диапазоне `1..speakerCount`. Назначение атомарное: одна ошибка отменяет весь вызов. Сегменты после `complete` неизменны |
| `ChatSession` | `ChatSession` | `ChatMessage`, `MessageAttachment` | Не больше 5 вложений у сообщения пользователя. Сообщение пользователя: текст или хотя бы одно вложение. `system`-сообщение только от агента, без трассировки и длительности. `dedupKey` уникален |
| `Task` | `Task` | `TaskTitle`, … | Прежние. `initiatorId` задан всегда. `creatorId ≠ initiatorId` допустим только при создании через агента |
| `TaskBatchDraft` | `TaskBatchDraft` | `DraftTaskItem` | От 1 до 30 задач. `consume` только из `draft`, повторный `consume` бросает `DraftAlreadyUsedError`. Новый черновик в том же thread переводит прежний в `superseded` |

### Value Objects
| Name | Поля | Почему VO (immutable/self-validating) |
|---|---|---|
| `TranscriptSegment` (transcription, existing, меняется) | `seq: number`, `speaker: number`, `startSec`, `endSec`, `text` | Самопроверка: `seq ≥ 0`, `speaker ≥ 1`, `0 ≤ start ≤ end`, текст непустой. Метка `Спикер N` теперь только отображение |
| `SpeakerName` (transcription, new) | `value: string` | Самопроверка: 1–100 символов после обрезки пробелов |
| `SpeakerNames` (transcription, new) | `Map<speaker, SpeakerName>` | Неизменяемая карта: `assign` возвращает новую. `labelOf(n)` даёт имя или `Спикер N` |
| `SpeakerAssignment` (transcription, new) | `speaker: number`, `name: string \| null` | Один пункт назначения, `null` или пустая строка сбрасывает имя |
| `SpeakerSummary` (transcription, new) | `speaker`, `name`, `talkSec`, `talkShare` | Результат чтения для агента и API |
| `ExtractedMeetingTask` (transcription, new) | `title`, `description`, `assigneeMention: string \| null`, `due: Date \| null`, `evidence: TaskEvidence` | Задача из встречи после проверки. Без `evidence` не создаётся |
| `TaskEvidence` (transcription, new) | `seq`, `startSec`, `speakerLabel`, `quote` | Самопроверка: цитата непустая. Соответствие сегменту проверяет `EvidenceValidator` |
| `MeetingDocumentKind` (transcription, new) | `'transcript' \| 'tasks'` | Закрытое множество для имени файла и лога |
| `AttachmentRef` (assistant, new) | `fileId`, `name`, `mediaType`, `kind`, `sizeBytes` | Проверенное вложение запуска. Создаётся только из ответа `FindOwnedFiles` |
| `MessageAttachment` (assistant, new) | `fileId`, `position`, а при чтении ещё `name`, `mediaType`, `kind`, `sizeBytes`, `status` | Вложение сообщения. Статус файла берётся из `stored_file` при чтении |
| `RunInput` (assistant, existing, меняется) | + `attachments: AttachmentRef[]` | Инвариант «текст или вложение», не больше 5 |
| `DraftTaskItem` (tasks, new) | `title: TaskTitle`, `description`, `deadline`, `assigneeId`, `creatorId`, `watcherIds`, `sourceNote: string \| null` | Карточка задачи из черновика с уже проверенными пользователями |
| `DraftOrigin` (tasks, new) | `kind: 'meeting'`, `fileId`, `recordingName` | Откуда пришёл список; при `meeting` после создания выпускается документ «Поставленные задачи» |
| `DocumentModel` (shared/documents, new) | `title`, `blocks: (Heading \| Paragraph \| Table)[]` | Нейтральная модель документа, общая для модулей. Без I/O |
| `TaskBatchResult` (tasks, new) | `items: { index, status: created \| failed, taskId?, reason? }[]` | Итог создания по каждой задаче |
| `ChatSystemMessagePosted` (assistant, событие, new) | `sessionId`, `ownerId`, `messageId`, `topic: meeting-transcript.ready \| meeting-transcript.failed`, `subject: { fileId, fileName }` | Событие для уведомлений, без текста сообщения |
| `TaskCreated` (tasks, событие, existing, меняется) | + `initiatorId` | Уведомления различают постановщика и инициатора |

### Services
| Service | Слой (application/domain/infrastructure) | Ответственность |
|---|---|---|
| `TranscriptSegmentRepositoryPort` / `TranscriptSegmentRepository` (transcription) | domain port / infrastructure | Запись сегментов пачкой в транзакции `complete`; чтение целиком, по диапазону `seq`, статистика речи по спикерам, выборка примеров |
| `MeetingTranscriptRepository` (transcription, existing, меняется) | infrastructure | Сохраняет `speaker_count`, имена (`meeting_transcript_speaker`). Сегменты пишет `TranscriptSegmentRepository` в той же транзакции |
| `EvidenceValidator` (transcription) | domain | Оставляет задачи, у которых `seq` существует, а нормализованная цитата входит в текст сегмента |
| `MeetingDueDateResolver` (transcription) | domain | Превращает `dueText` в дату относительно даты загрузки записи, по тем же правилам, что относительные даты задач |
| `RenameSpeakersUseCase` (transcription) | application | Владелец (404), `completed` (409), атомарное назначение (422) и сохранение |
| `GetMeetingTranscriptUseCase` (transcription, existing, меняется) | application | + список спикеров с именами и временем речи, сегменты из `TranscriptSegmentRepository` |
| `GetSpeakerSamplesUseCase` (transcription) | application | Сводка по спикерам и 2–3 длинные реплики каждого из разных частей записи |
| `ExtractMeetingTasksUseCase` (transcription) | application | Читает сегменты, нарезает окна при длинной расшифровке, вызывает `TaskExtractorPort`, проверяет основания, приводит сроки |
| `TaskExtractorPort` / `LlmTaskExtractor` (transcription) | domain port / infrastructure | Structured output (zod) по репликам `[seq] [чч:мм:сс] Имя: текст`, температура 0. Второй вызов сливает результаты окон |
| `MeetingDocuments` (transcription) | application | Собирает модель документа (шапка, склеенные реплики или таблица задач), рендерит, сохраняет через `StoreGeneratedFile`, пишет лог без текста |
| `DocumentRendererPort` / `DocxDocumentRenderer` (shared/documents) | port / infrastructure | `DocumentModel` → `Buffer` `.docx` на библиотеке `docx`. Общий для `transcription` и `tasks` |
| `NotifyChatOnTranscriptFinished` (transcription) | application (outbox-подписчик) | На `meeting-transcript.completed/failed`: найти чат (`FindFirstChatOfFile`), выбрать текст по статусу и причине, для `completed` выпустить документ, вызвать `PostSystemMessage` с `dedupKey = eventId`. Для `file-deleted` и записи не из чата ничего не делает |
| `MeetingsAgentCapability` (transcription, `interface/agent`) | interface | `AgentCapability` `meetings` в режиме `fork`: промпт, инструменты `get_meeting_transcript`, `get_speaker_samples`, `rename_speakers`, `extract_meeting_tasks`, `retry_transcription` |
| `MeetingTranscriptsController` (transcription, existing, меняется) | interface/http | + `PUT /transcripts/:fileId/speakers` |
| `StoreGeneratedFileUseCase` (files, экспорт) | application | Буфер → MinIO → `StoredFile.upload` и событие в одной транзакции, компенсация `delete` при сбое |
| `FindOwnedFilesUseCase` (files, экспорт) | application | По списку id: все свои и `active`, иначе `FileNotFoundError` или `FileGoneError` с id |
| `StartAgentRunUseCase` (assistant, existing, меняется) | application | Проверка вложений через `FindOwnedFiles` до потока, `RunInput` с `AttachmentRef[]`, сохранение сообщения пользователя с вложениями |
| `RunAttachments` (shared/agent-capability, new) | domain-объект запуска | Сборщик файлов, которые агент приложил за запуск; уведомляет подписчика о каждом добавлении |
| `AgentRunContext` (shared, existing, меняется) | — | + `attachments: RunAttachments` |
| `AgentRunner` (assistant, existing, меняется) | infrastructure | AG-UI `CUSTOM file-attached` при добавлении файла; при `run-finished` передаёт вложения в сохранение ответа; блок `[Вложения]` в `HumanMessage` |
| `AgentProfileFactory` (assistant, existing, меняется) | infrastructure | + `meetings` в профиле «приложение»; `appendAssistantMessage(threadId, text)` через `graph.updateState` |
| `PostSystemMessageUseCase` (assistant, экспорт) | application | Нет чата → `skipped`. Идёт запуск → `RunInProgressError` (ретрай в очереди). Иначе: checkpointer, затем `chat_message` (`ON CONFLICT dedup_key DO NOTHING`), `last_activity_at`, событие `ChatSystemMessagePosted` |
| `SystemMessageQueue` / `SystemMessageProcessor` (assistant) | infrastructure | BullMQ `chat-system-message`: задержка 5 с при `RunInProgressError`, предельный срок 10 мин, `jobId = dedupKey` |
| `FindFirstChatOfFileUseCase` (assistant, экспорт) | application | Первый существующий чат владельца, где файл приложен к сообщению пользователя |
| `ChatSessionRepository` (assistant, existing, меняется) | infrastructure | Сообщения с `source`, `dedup_key` и вложениями; история соединяется со `stored_file` для статуса |
| `AgentController` / `ChatSessionsController` (assistant, existing, меняется) | interface/http | `forwardedProps.fileIds` в запуске; вложения и `source` в истории |
| `CreateTaskUseCase` (tasks, existing, меняется) | application | `actor` — инициатор, необязательный `creatorId` (только для агента), проверка активности постановщика, `initiatorId` в событии |
| `TaskBatchDraftRepositoryPort` / `TaskBatchDraftRepository` (tasks) | domain port / infrastructure | `save`, `supersedeActive(threadId)`, `consume(id, ownerId)` атомарным `UPDATE … WHERE status = 'draft' RETURNING` |
| `ProposeTasksUseCase` (tasks) | application | Проверяет пользователей (исполнитель, постановщик, наблюдатели), сохраняет черновик, прежний помечает `superseded`, возвращает карточки с номерами |
| `CreateTasksFromDraftUseCase` (tasks) | application | `consume`, затем `CreateTaskUseCase` на каждую задачу в своей транзакции, итог `TaskBatchResult`. Для `origin = meeting` выпускает документ через `TasksReportDocument` |
| `TasksReportDocument` (tasks) | application | `TaskBatchResult` + имена пользователей → `DocumentModel` «Поставленные задачи» → `DocumentRendererPort` → `StoreGeneratedFile` → `RunAttachments` |
| `task-tools` / `task-creation` skill (tasks, existing, меняется) | interface/agent | `propose_tasks`, `create_tasks` вместо `create_task`; правила списка, постановщика и пометки «от имени» |
| `NotifyOnTaskCreated` (notifications, existing, меняется) | application | + `task.created-on-behalf`, если `creatorId ≠ initiatorId` |
| `NotifyOnChatSystemMessage` (notifications) | application (outbox-подписчик) | `ChatSystemMessagePosted` → уведомление со ссылкой `chat` |

### Method Signatures (ключевые, по каждому сервису)
| Service.Method | Params | Returns | Краткое описание |
|---|---|---|---|
| `MeetingTranscript.assignSpeakers` | `assignments: SpeakerAssignment[]`, `now` | `void` | `TranscriptNotReadyError` (не `completed`), `UnknownSpeakerError(speakers)`, `InvalidSpeakerNameError`. Применяет всё или ничего |
| `SpeakerNames.labelOf` | `speaker: number` | `string` | Имя или `Спикер N` |
| `TranscriptSegmentRepositoryPort.insertAll` | `fileId`, `segments: TranscriptSegment[]` | `Promise<void>` | Внутри транзакции `complete` |
| `TranscriptSegmentRepositoryPort.readAll` | `fileId` | `Promise<TranscriptSegment[]>` | По `seq` |
| `TranscriptSegmentRepositoryPort.speakerStats` | `fileId` | `Promise<{ speaker; talkSec }[]>` | Агрегат по сегментам |
| `TranscriptSegmentRepositoryPort.samples` | `fileId`, `perSpeaker: number` | `Promise<TranscriptSegment[]>` | Самые длинные реплики из разных третей записи |
| `RenameSpeakersUseCase.execute` | `{ ownerId, fileId, assignments }` | `Promise<SpeakerSummary[]>` | 200 / 404 / 409 / 422 |
| `GetSpeakerSamplesUseCase.execute` | `{ ownerId, fileId }` | `Promise<{ speakers: SpeakerSummary[]; samples: TranscriptSegment[] }>` | 404 / 409 |
| `ExtractMeetingTasksUseCase.execute` | `{ ownerId, fileId }` | `Promise<ExtractedMeetingTask[]>` | Пусто, если задач нет. 404 / 409 |
| `TaskExtractorPort.extract` | `lines: string[]`, `context: { participants: string[]; meetingDate: Date }` | `Promise<RawExtractedTask[]>` | `RawExtractedTask = { title, description, assigneeMention, dueText, evidence: { seq, quote } }` |
| `TaskExtractorPort.merge` | `batches: RawExtractedTask[][]` | `Promise<RawExtractedTask[]>` | Слияние окон, удаление дублей |
| `EvidenceValidator.filter` | `tasks: RawExtractedTask[]`, `segments: Map<seq, TranscriptSegment>` | `RawExtractedTask[]` | Чистая функция |
| `MeetingDocuments.issueTranscript` | `{ ownerId, fileId }` | `Promise<StoredFileView>` | Документ расшифровки с текущими именами |
| `MeetingDocuments.issueTasks` | `{ ownerId, fileId, tasks: ExtractedMeetingTask[] }` | `Promise<StoredFileView>` | Документ задач |
| `DocumentRendererPort.render` | `doc: DocumentModel` | `Promise<Buffer>` | Без I/O |
| `TasksReportDocument.issue` | `{ ownerId, origin: DraftOrigin, result: TaskBatchResult, items: DraftTaskItem[] }` | `Promise<StoredFileView>` | Документ итога постановки |
| `NotifyChatOnTranscriptFinished.handle` | `event: MeetingTranscriptCompleted \| MeetingTranscriptFailed`, `eventId` | `Promise<void>` | Идемпотентно через `dedupKey` |
| `StoreGeneratedFileUseCase.execute` | `{ ownerId, name, mediaType, buffer: Buffer }` | `Promise<StoredFileView>` | Вид `document`, обычный срок хранения |
| `FindOwnedFilesUseCase.execute` | `{ ownerId, fileIds: string[] }` | `Promise<StoredFileView[]>` | Порядок как во входе. `FileNotFoundError(id)` / `FileGoneError(id)` |
| `RunInput.of` | `{ threadId, runId, question, attachments }` | `RunInput` | `InvalidRunInputError` |
| `RunAttachments.add` | `file: AttachmentRef` | `void` | Без дублей, уведомляет подписчика |
| `RunAttachments.list` | `—` | `AttachmentRef[]` | В порядке добавления |
| `AgentProfileFactory.appendAssistantMessage` | `threadId`, `text: string` | `Promise<void>` | `updateState` графа профиля «приложение» |
| `PostSystemMessageUseCase.execute` | `{ sessionId, ownerId, text, attachments: string[], dedupKey, topic, subject }` | `Promise<'posted' \| 'duplicate' \| 'skipped'>` | `RunInProgressError` для ретрая |
| `FindFirstChatOfFileUseCase.execute` | `{ ownerId, fileId }` | `Promise<string \| null>` | id чата или `null` |
| `ChatSessionRepository.appendMessage` | `sessionId`, `{ role, text, source, toolCalls?, durationMs?, attachments: string[], dedupKey? }` | `Promise<{ id } \| null>` | `null` при конфликте `dedupKey` |
| `CreateTaskUseCase.execute` | `actor: Actor`, `input: CreateTaskInput & { creatorId?: string }` | `Promise<TaskView>` | `creatorId` по умолчанию `actor.id` |
| `TaskBatchDraft.consume` | `—` | `DraftTaskItem[]` | `DraftAlreadyUsedError` |
| `ProposeTasksUseCase.execute` | `actor`, `{ threadId, items: ProposedItemInput[], origin?: DraftOrigin }` | `Promise<{ draftId; cards: DraftCardView[] }>` | `UnknownUserError(index, field)`, `TooManyItemsError` |
| `CreateTasksFromDraftUseCase.execute` | `actor`, `{ draftId }` | `Promise<{ result: TaskBatchResult; report: StoredFileView \| null }>` | Уже использован → `DraftAlreadyUsedError` (агент отвечает «уже создано») |

---

## Frontend — UI Model

Фронт — `control-center` (Electron, React 19, assistant-ui, zustand, TanStack Query). FSD в этом приложении нет, и `frontend/CLAUDE.md` в проекте отсутствует. Фактическая структура: `features/<name>/` (UI и хуки фичи), `lib/backend/` (API-клиенты, zod-схемы, query options), `stores/`, `components/ui/` (shadcn). Новое кладём по этой структуре, не вводя FSD частично.

### Pages
| Page | Route | Структура (ui / +model / +mediator) | Назначение |
|---|---|---|---|
| `ChatLayout` (existing) | раздел «Чаты» (роутера нет, `ui.store`) | без изменений | Список чатов и `ChatThread` |

### Features (переиспользуемые модули с бизнес-логикой)
| Feature | Статус (new/existing) | Публичный API (index.ts) | model/ (хуки, api.ts) | Назначение |
|---|---|---|---|---|
| `features/chat` | existing, меняется | `ChatThread` | `use-composer-attachments.ts` (new), `use-thread-history.ts`, `ChatRuntimeProvider` (передаёт `fileIds`, обрабатывает `CUSTOM file-attached`) | Прикрепление файлов, карточки в сообщениях, сообщения системы |
| `features/notifications` | existing, меняется | без изменений | `use-open-notification.ts` (объект `chat` → открыть чат), `use-notifications-stream.ts` (на `meeting-transcript.*` инвалидировать историю открытого чата) | Переход в чат и обновление ленты |

### UI-компоненты (page-local и shared)
| Component | Слой (pages/<Page>/ui · shared/ui-kit · shared/ui legacy) | Props (основные) | Назначение |
|---|---|---|---|
| `Composer` | `features/chat` (existing, меняется) | — | Кнопка «Прикрепить», зона перетаскивания на панели, блокировка отправки во время загрузки, отправка только с файлом |
| `ComposerAttachments` | `features/chat` (new) | `items: DraftAttachment[]`, `onRemove(id)`, `onCancel(id)`, `onRetry(id)` | Карточки над полем ввода: прогресс, ошибка, «убрать» |
| `FileCard` | `features/chat` (new) | `file: { id, name, sizeBytes, mediaType, status }`, `onDownload?` | Карточка файла в сообщении; неактивна при `deleted` |
| `MessageAttachments` | `features/chat` (new) | `files: MessageFile[]` | Список `FileCard` в сообщении |
| `UserMessage` / `AssistantMessage` | `features/chat` (existing, меняются) | — | Вывод вложений; у `AssistantMessage` вариант «сообщение системы» без хода работы |

### Hooks (model)
| Hook | Расположение | Тип (state-хук / query options factory) | Возвращает |
|---|---|---|---|
| `useComposerAttachments` | `features/chat/use-composer-attachments.ts` | state-хук | `{ items, add(files), remove(id), cancel(id), retry(id), readyFileIds, isUploading }` |
| `useUploadFile` | `lib/backend/files.queries.ts` (new) | mutation | загрузка с `onProgress` и `signal` |
| `useDownloadFile` | `lib/backend/files.queries.ts` (new) | mutation | ссылка → `saveBlob` с исходным именем |
| `threadHistoryOptions` | `features/chat/use-thread-history.ts` (existing) | query options factory | История со вложениями и `source` (схема в `lib/backend/schema.ts`) |

Сопутствующие изменения:
- `lib/backend/files.api.ts` (new): `uploadFile(file, { onProgress, signal })` и `createDownloadLink(id)`. XHR-загрузка выносится из `tasks.api.ts` в `lib/backend/xhr-upload.ts` и используется в обоих местах.
- `lib/backend/schema.ts`: в сообщении появляются `attachments` и `source`.
- `src/main/cc-api-protocol.ts`: в `ALLOWED_PREFIXES` добавляется `/files`.

### Паттерны, которые нужно учесть при проектировании
- [x] Публичный API фичи только через `index.ts` (реэкспорт корневого UI-компонента)
- [x] Запросы к backend — через query options factory в `model/api.ts` (`queryOptions({...})`), не голыми async-функциями. В этом приложении это `lib/backend/*.queries.ts`
- [x] Ошибки API нормализуются через `ApiError`. В этом приложении — `lib/backend/errors.ts`: 413, 415 и 404/410 превращаются в тексты на карточке
- [ ] Для страницы с несколькими stateful-виджетами — `mediator/`-компонент без условного рендера (не применимо)
- [ ] Layout/контейнерные компоненты принимают именованные слоты (не применимо: новых layout нет)
- [ ] Разделение `isInitialLoad` / `isRefreshing` (не применимо)
- [ ] Новые компоненты — в `shared/ui-kit/` (не применимо: такого слоя в `control-center` нет; базовые элементы берём из `components/ui`)

---

## Diagrams

### 1. Domain Entity Interaction
- `MeetingTranscript` владеет `SpeakerNames` и ссылается на сегменты в отдельной таблице. Готовая расшифровка порождает события.
- `NotifyChatOnTranscriptFinished` превращает событие в документ и сообщение системы в `ChatSession`.
- `ChatMessage` содержит `MessageAttachment`, которые ссылаются на `StoredFile`.
- Специалист по встречам выпускает `ExtractedMeetingTask` с `TaskEvidence`. Из них через специалиста по задачам получается `TaskBatchDraft` с `DraftTaskItem`, а из черновика — `Task` с `creatorId` и `initiatorId`.

Miro link: https://miro.com/app/board/uXjVEP6UhAI=/?moveToWidget=3458764690207009445

### 2. External Modules Interaction
Клиент Electron → `files` (загрузка, ссылка) и `assistant` (запуск с `fileIds`, история).
- `assistant` → `files` (`FindOwnedFiles`) и оркестратор, который делегирует специалистам `meetings` (`transcription`) и `tasks`.
- `meetings` → `files` (`StoreGeneratedFile`), OpenRouter (извлечение задач).
- outbox `meeting-transcript.*` → `transcription` → `assistant` (`FindFirstChatOfFile`, `PostSystemMessage` через BullMQ).
- outbox `chat.system-message-posted` и `task.created` → `notifications` → realtime → Electron.

Miro link: https://miro.com/app/board/uXjVEP6UhAI=/?moveToWidget=3458764690207009446

### 3. Layer Interaction — от Controller до Response
1. Загрузка записи и запуск с `fileIds`: проверка, ответ «расшифровка запущена».
2. Фоновая расшифровка завершена: событие, подписчик, документ, сообщение системы (с ожиданием, если идёт запуск), уведомление, обновление открытого чата.
3. «Спикер 1 — Анна»: `rename_speakers`, документ, событие `CUSTOM file-attached`, сохранение ответа с вложением.
4. «Извлеки задачи»: `extract_meeting_tasks`, документ.
5. «Создавай»: `propose_tasks`, подтверждение, `create_tasks`, итог.

Miro link: https://miro.com/app/board/uXjVEP6UhAI=/?moveToWidget=3458764690207009447

---

## Confirmation Checklist
- [x] Названия entity/aggregate/VO согласованы
- [x] Названия и сигнатуры ключевых методов сервисов согласованы
- [x] Слои (pages/features/kernel/shared), структура model/ui и паттерны фронта согласованы
- [x] Диаграммы взаимодействия отражают ожидаемую реализацию
- [x] Пользователь подтвердил переход к tasks.md
