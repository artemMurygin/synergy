## 1. Подготовка

- [x] 1.1 Заархивировать `add-file-storage` (`openspec archive add-file-storage`), чтобы спеки `file-storage` и `meeting-transcription` появились в `openspec/specs/`. Проверка — `openspec validate add-meeting-transcription-agent --strict` проходит, а `openspec/specs/meeting-transcription/spec.md` существует
- [x] 1.2 Добавить зависимость `docx` в `backend/package.json`. Проверка — `npm ci` и `npm run typecheck` в `backend` проходят
- [x] 1.3 Добавить env `MEETING_TASKS_EXTRACTION_MODEL`, `MEETING_TASKS_WINDOW_TOKENS` (по умолчанию 60000), `MEETING_TASKS_WINDOW_MIN` (30), `CHAT_SYSTEM_MESSAGE_RETRY_MS` (5000) и `CHAT_SYSTEM_MESSAGE_DEADLINE_MS` (600000) в `env.schema.ts` и `.env.example`, с тестом на значения по умолчанию. Проверка — тест схемы окружения зелёный

## 2. Миграции БД

- [x] 2.1 Написать интеграционные тесты миграций по образцу `meeting-transcripts-migration.spec.ts`:
  - `022`: сегменты из `segments JSONB` переносятся в `meeting_transcript_segment` с `seq` по порядку и номером спикера из `Спикер N`, колонка `segments` удалена, `meeting_transcript_speaker` пустая;
  - `023`: `chat_message.source` по умолчанию `run`, `dedup_key` уникален, `chat_message_attachment` каскадно удаляется вместе с сообщением;
  - `024`: `task.initiator_id` заполнен значением `creator_id` и `NOT NULL`;
  - `025`: в `task_batch_draft` проходят CHECK статусов.

  Убедиться, что vitest видит тесты
- [x] 2.2 Прогнать тесты из 2.1 и зафиксировать, что они падают (red): миграций ещё нет
- [x] 2.3 Написать миграции `022_meeting_transcript_segments.sql`, `023_chat_attachments.sql`, `024_task_initiator.sql`, `025_task_batch_draft.sql`, у каждой down-часть по design.md («Migration Plan»)
- [x] 2.4 Прогнать тесты из 2.1 и зафиксировать, что они зелёные (green); регрессий в тестах других миграций нет

## 3. `shared/documents`: модель документа и генератор `.docx`

- [ ] 3.1 Написать тесты на `DocumentModel` и `DocxDocumentRenderer`:
  - заголовок, абзацы и таблица попадают в `word/document.xml` (распаковать буфер);
  - кириллица сохраняется;
  - пустая ячейка рендерится прочерком;
  - результат — валидный zip с `[Content_Types].xml`.

  Убедиться, что vitest их видит
- [ ] 3.2 Прогнать тесты из 3.1 и зафиксировать, что они падают (red): модуля ещё нет
- [ ] 3.3 Реализовать `shared/documents`: `DocumentModel`, `DocumentRendererPort`, адаптер `DocxDocumentRenderer` на `docx`, Nest-провайдер
- [ ] 3.4 Прогнать тесты из 3.1 и зафиксировать, что они зелёные (green), регрессий нет

## 4. `transcription`: домен спикеров и сегментов

- [ ] 4.1 Написать тесты по спеке `meeting-transcription` и таблицам architecture.md:
  - `TranscriptSegment`: `seq ≥ 0`, `speaker ≥ 1`, `start ≤ end`, непустой текст;
  - `SpeakerName`: 1–100 символов после обрезки;
  - `SpeakerNames`: `assign` возвращает новую карту, пустое имя сбрасывает, `labelOf` возвращает имя или `Спикер N`, одно имя у двух спикеров допустимо;
  - `MeetingTranscript.assignSpeakers`: только при `completed` (`TranscriptNotReadyError`), номер вне `1..speakerCount` даёт `UnknownSpeakerError` со списком и ни одно имя не меняется;
  - `TranscriptMerger` выдаёт номера спикеров, а не строки.

  Убедиться, что vitest видит тесты
- [ ] 4.2 Прогнать тесты из 4.1 и зафиксировать, что они падают (red) по ожидаемой причине
- [ ] 4.3 Реализовать VO `SpeakerName`, `SpeakerNames`, `SpeakerAssignment`, изменить `TranscriptSegment` (`seq`, числовой `speaker`) и `MeetingTranscript` (убрать `segments`, добавить `speakerNames`, `assignSpeakers`), обновить `TranscriptMerger` и `DiarizedTranscript`
- [ ] 4.4 Прогнать тесты из 4.1 и все тесты `transcription/meeting/domain`, зафиксировать, что они зелёные (green)

## 5. `transcription`: хранение сегментов и имён

- [ ] 5.1 Написать интеграционные тесты (Postgres) на `TranscriptSegmentRepository` (`insertAll`, `readAll` по `seq`, `speakerStats`, `samples` из разных третей записи) и `MeetingTranscriptRepository` (сохранение и чтение имён, сброс имени удаляет строку). На `TranscribeMeetingUseCase` — сегменты пишутся в одной транзакции с `complete`, при отброшенном результате (`file-deleted`) сегментов нет. Убедиться, что vitest видит тесты
- [ ] 5.2 Прогнать тесты из 5.1 и зафиксировать, что они падают (red)
- [ ] 5.3 Реализовать `TranscriptSegmentRepositoryPort` и `TranscriptSegmentRepository`, изменить `MeetingTranscriptRepository` и `TranscribeMeetingUseCase`
- [ ] 5.4 Прогнать тесты из 5.1 и все тесты модуля `transcription`, зафиксировать, что они зелёные (green)

## 6. `transcription`: имена спикеров через API

- [ ] 6.1 Написать тесты на `RenameSpeakersUseCase` (200, 404 для чужой, 409 не `completed`, 422 атомарно), на изменённый `GetMeetingTranscriptUseCase` (список спикеров с именами и временем речи только при `completed`) и на контроллер `PUT /transcripts/:fileId/speakers` (валидация тела, коды ответов). Убедиться, что vitest видит тесты
- [ ] 6.2 Прогнать тесты из 6.1 и зафиксировать, что они падают (red)
- [ ] 6.3 Реализовать `RenameSpeakersUseCase`, изменить `GetMeetingTranscriptUseCase` и `MeetingTranscriptView`, добавить эндпоинт в `MeetingTranscriptsController`
- [ ] 6.4 Прогнать тесты из 6.1 и зафиксировать, что они зелёные (green), регрессий в тестах контроллера нет

## 7. `files`: сохранение созданного файла и проверка вложений

- [ ] 7.1 Написать тесты:
  - `StoreGeneratedFileUseCase`: буфер сохраняется как `document` с обычным сроком хранения, событие `file.uploaded`, компенсация `delete` при сбое транзакции;
  - `FindOwnedFilesUseCase`: порядок как во входе, `FileNotFoundError` для чужого или несуществующего, `FileGoneError` для удалённого.

  Убедиться, что vitest видит тесты
- [ ] 7.2 Прогнать тесты из 7.1 и зафиксировать, что они падают (red)
- [ ] 7.3 Реализовать оба use case'а и экспортировать их из `FilesModule`
- [ ] 7.4 Прогнать тесты из 7.1 и все тесты модуля `files`, зафиксировать, что они зелёные (green)

## 8. `transcription`: документы встречи

- [ ] 8.1 Написать тесты на `MeetingDocuments` по спеке `meeting-documents`:
  - расшифровка: шапка с датой, длительностью в формате `чч:мм:сс` и участниками; реплики `[чч:мм:сс] Имя: текст`; склейка подряд идущих реплик одного имени (в том числе двух спикеров с одним именем);
  - задачи встречи: колонки и прочерки;
  - имена файлов по шаблону;
  - каждый вызов создаёт новый файл;
  - документ собирается после удаления записи;
  - в логе нет текста.

  Генератор и `StoreGeneratedFile` подменяются тестовыми двойниками. Убедиться, что vitest видит тесты
- [ ] 8.2 Прогнать тесты из 8.1 и зафиксировать, что они падают (red)
- [ ] 8.3 Реализовать `MeetingDocuments` (`issueTranscript`, `issueTasks`) и `MeetingDocumentKind`
- [ ] 8.4 Прогнать тесты из 8.1 и зафиксировать, что они зелёные (green)

## 9. `transcription`: извлечение задач

- [ ] 9.1 Написать тесты:
  - `EvidenceValidator`: отбрасывает задачи без основания, с несуществующим `seq` и с цитатой не из сегмента; нормализует регистр и пробелы;
  - `MeetingDueDateResolver`: «до пятницы» считается от даты загрузки записи, а не от сегодняшней; непонятный срок даёт `null`;
  - `ExtractMeetingTasksUseCase`: короткая расшифровка обрабатывается одним вызовом, длинная — окнами с перекрытием и слиянием; «задач нет» даёт пустой список; 404 для чужой; 409 для неготовой. `TaskExtractorPort` подменяется двойником.

  Убедиться, что vitest видит тесты
- [ ] 9.2 Прогнать тесты из 9.1 и зафиксировать, что они падают (red)
- [ ] 9.3 Реализовать `EvidenceValidator`, `MeetingDueDateResolver`, `ExtractMeetingTasksUseCase`, `TaskExtractorPort` и `LlmTaskExtractor` (zod-схема structured output, температура 0, промпт с запретом придумывать задачи)
- [ ] 9.4 Прогнать тесты из 9.1 и зафиксировать, что они зелёные (green)
- [ ] 9.5 Проверить `LlmTaskExtractor` на реальной обезличенной расшифровке (скрипт в `transcription/bench`, результаты в git не попадают): у каждой задачи есть подтверждённая цитата, выдуманных исполнителей нет. Итог (число задач, отброшенных валидатором, время, стоимость) записать в раздел «Итоги проверки извлечения» в design.md

## 10. `transcription`: примеры реплик спикеров

- [ ] 10.1 Написать тесты на `GetSpeakerSamplesUseCase`: 2–3 реплики на спикера из разных частей записи, доля речи, имена; 404 и 409. Убедиться, что vitest их видит
- [ ] 10.2 Прогнать тесты из 10.1 и зафиксировать, что они падают (red)
- [ ] 10.3 Реализовать `GetSpeakerSamplesUseCase`
- [ ] 10.4 Прогнать тесты из 10.1 и зафиксировать, что они зелёные (green)

## 11. `assistant`: вложения в запуске и истории

- [ ] 11.1 Написать тесты по спекам `chat-attachments`, `agent-streaming-protocol` и `chat-sessions`:
  - `RunInput`: текст или вложение, не больше 5;
  - `StartAgentRunUseCase`: чужой или несуществующий файл даёт «не найдено» до потока, удалённый — причину «срок хранения истёк», в обоих случаях ничего не сохраняется; сообщение пользователя сохраняется с вложениями; блок `[Вложения]` попадает в `HumanMessage`;
  - `ChatSessionRepository`: вложения в порядке отправки, статус файла из `stored_file`, `source`, конфликт `dedup_key` даёт `null`;
  - контроллеры: `forwardedProps.fileIds` и вложения с `source` в истории.

  Убедиться, что vitest видит тесты
- [ ] 11.2 Прогнать тесты из 11.1 и зафиксировать, что они падают (red)
- [ ] 11.3 Реализовать `AttachmentRef`, `MessageAttachment`, изменить `RunInput`, `ChatMessage`, `StartAgentRunUseCase`, `ChatSessionRepository`, `AgentController`, `ChatSessionsController` и схемы ответов
- [ ] 11.4 Прогнать тесты из 11.1 и все тесты модуля `assistant`, зафиксировать, что они зелёные (green)

## 12. `assistant`: файлы в ответе агента

- [ ] 12.1 Написать тесты:
  - `RunAttachments`: без дублей, уведомляет подписчика;
  - `AgentRunner`: при добавлении файла в поток уходит `CUSTOM file-attached` до `run-finished`; вложения сохраняются вместе с ответом; при ошибке и отмене не сохраняются; клиент без поддержки `CUSTOM` получает тот же текст.

  Убедиться, что vitest видит тесты
- [ ] 12.2 Прогнать тесты из 12.1 и зафиксировать, что они падают (red)
- [ ] 12.3 Реализовать `RunAttachments` в `shared/agent-capability`, добавить его в `AgentRunContext`, изменить `AgentRunner` и `map-stream-event`
- [ ] 12.4 Прогнать тесты из 12.1 и зафиксировать, что они зелёные (green), регрессий в тестах потока нет

## 13. `assistant`: сообщения системы

- [ ] 13.1 Написать тесты по спеке `chat-sessions` («Сообщения системы в чате»):
  - `PostSystemMessageUseCase`: свободный чат → `posted` (сначала checkpointer, потом строка, обновляется `last_activity_at`, публикуется `ChatSystemMessagePosted`); активный запуск → `RunInProgressError`; повтор `dedupKey` → `duplicate`; удалённый чат → `skipped`;
  - `SystemMessageProcessor`: ретрай с задержкой до предельного срока;
  - `FindFirstChatOfFileUseCase`: первый существующий чат владельца, `null` после удаления чата;
  - `AgentProfileFactory.appendAssistantMessage`: интеграционный тест с Postgres-checkpointer — следующий запуск видит сообщение в истории.

  Убедиться, что vitest видит тесты
- [ ] 13.2 Прогнать тесты из 13.1 и зафиксировать, что они падают (red)
- [ ] 13.3 Реализовать `PostSystemMessageUseCase`, `SystemMessageQueue` и `SystemMessageProcessor` (BullMQ `chat-system-message`), `FindFirstChatOfFileUseCase`, `appendAssistantMessage`, событие `ChatSystemMessagePosted` с регистрацией в outbox; экспортировать контракты из `AssistantModule`
- [ ] 13.4 Прогнать тесты из 13.1 и зафиксировать, что они зелёные (green)

## 14. `transcription`: сообщение в чат по результату расшифровки

- [ ] 14.1 Написать тесты на `NotifyChatOnTranscriptFinished` по спеке `meeting-assistant` («Готовая расшифровка приходит в чат»):
  - `completed`: документ и текст с числом спикеров и длительностью;
  - `no_speech`: текст без предложения повтора;
  - `failed`: тексты по каждой причине из `ui-design.md`, предложение повтора только для `provider-unavailable` и `timeout` при хранящейся записи, для удалённой записи — предложение загрузить заново;
  - `file-deleted` и запись не из чата: ничего не делается;
  - `dedupKey = eventId`.

  Убедиться, что vitest видит тесты
- [ ] 14.2 Прогнать тесты из 14.1 и зафиксировать, что они падают (red)
- [ ] 14.3 Реализовать подписчик и зарегистрировать его на события `meeting-transcript.completed` и `meeting-transcript.failed`
- [ ] 14.4 Прогнать тесты из 14.1 и зафиксировать, что они зелёные (green)

## 15. Специалист по встречам

- [ ] 15.1 Написать тесты на `MeetingsAgentCapability` по образцу `tasks-agent.capability.spec.ts`:
  - инструменты `get_meeting_transcript`, `get_speaker_samples`, `rename_speakers`, `extract_meeting_tasks`, `retry_transcription` работают от `ctx.userId`;
  - чужая расшифровка даёт «не найдено»;
  - `rename_speakers` и `extract_meeting_tasks` кладут документ в `RunAttachments`;
  - агенту возвращаются сводки без полного текста расшифровки;
  - промпт содержит правила предложения следующего шага, запрет менять текст реплик и переспрос при неоднозначности.

  На `AgentProfileFactory`: в профиле «приложение» три специалиста, Telegram без изменений. Убедиться, что vitest видит тесты
- [ ] 15.2 Прогнать тесты из 15.1 и зафиксировать, что они падают (red)
- [ ] 15.3 Реализовать `transcription/meeting/interface/agent` (инструменты, промпт, capability `meetings` в режиме `fork`), подключить в `AgentProfileFactory`, дополнить промпт оркестратора правилом передачи списка задач без пересказа
- [ ] 15.4 Прогнать тесты из 15.1 и все тесты `assistant` и `transcription`, зафиксировать, что они зелёные (green)

## 16. `tasks`: инициатор и постановщик

- [ ] 16.1 Написать тесты по спеке `task-management`:
  - `Task.create` с `initiatorId`;
  - `CreateTaskUseCase`: по умолчанию `creatorId` равен инициатору, а заданный `creatorId` проверяется на активность;
  - `TaskCreated` содержит `initiatorId`;
  - `POST /tasks` игнорирует создателя и инициатора из тела;
  - ответ задачи содержит инициатора, у старых задач он равен создателю.

  Убедиться, что vitest видит тесты
- [ ] 16.2 Прогнать тесты из 16.1 и зафиксировать, что они падают (red)
- [ ] 16.3 Изменить `Task`, `CreateTaskUseCase`, `TaskCreated`, `SlonikTaskRepository`, `TaskView` и ответы HTTP
- [ ] 16.4 Прогнать тесты из 16.1 и все тесты модуля `tasks`, зафиксировать, что они зелёные (green)

## 17. `tasks`: черновик списка и создание по нему

- [ ] 17.1 Написать тесты по спеке `task-agent-tools` («Создание задач списком»):
  - `TaskBatchDraft`: 1–30 задач, повторный `consume` бросает `DraftAlreadyUsedError`;
  - `TaskBatchDraftRepository`: атомарный `consume`, а при двух параллельных вызовах побеждает один;
  - `ProposeTasksUseCase`: неизвестный исполнитель или постановщик даёт ошибку с номером задачи, прежний черновик становится `superseded`;
  - `CreateTasksFromDraftUseCase`: каждая задача создаётся отдельно, частичный сбой отражается в итоге, повтор даёт «уже создано»;
  - `TasksReportDocument`: документ «Поставленные задачи» по спеке `meeting-documents` выпускается только при `origin = meeting`, исключённых задач в нём нет, имена пользователей подставлены.

  Убедиться, что vitest видит тесты
- [ ] 17.2 Прогнать тесты из 17.1 и зафиксировать, что они падают (red)
- [ ] 17.3 Реализовать `TaskBatchDraft`, `DraftTaskItem`, `DraftOrigin`, `TaskBatchResult`, репозиторий, `ProposeTasksUseCase`, `CreateTasksFromDraftUseCase` и `TasksReportDocument`
- [ ] 17.4 Прогнать тесты из 17.1 и зафиксировать, что они зелёные (green)

## 18. `tasks`: инструменты агента

- [ ] 18.1 Написать тесты на `task-tools` и skill `task-creation`:
  - `propose_tasks` и `create_tasks` вместо `create_task`, одиночная задача идёт тем же путём;
  - `origin` передаётся, когда список пришёл из встречи;
  - `create_tasks` кладёт документ в `RunAttachments`;
  - в skill есть правила списка, исключения по номеру, постановщика с пометкой «от имени», лимита 30 и запрета создавать без подтверждения.

  Убедиться, что vitest видит тесты
- [ ] 18.2 Прогнать тесты из 18.1 и зафиксировать, что они падают (red)
- [ ] 18.3 Изменить `task-tools.ts`, `tasks-agent-prompt.ts` и skill `task-creation`
- [ ] 18.4 Прогнать тесты из 18.1 и все тесты `tasks/interface/agent`, зафиксировать, что они зелёные (green); профиль Telegram продолжает создавать задачи

## 19. `notifications`: новые типы

- [ ] 19.1 Написать тесты по спеке `notifications`:
  - `NotifyOnTaskCreated` создаёт `task.created-on-behalf` при `creatorId ≠ initiatorId`, вместе с `task.assigned`, когда постановщик ещё и ответственный; повтор события не создаёт дублей;
  - `NotifyOnChatSystemMessage` создаёт `meeting-transcript.ready` или `meeting-transcript.failed` со ссылкой `chat` и именем записи, без текста расшифровки.

  Убедиться, что vitest видит тесты
- [ ] 19.2 Прогнать тесты из 19.1 и зафиксировать, что они падают (red)
- [ ] 19.3 Реализовать изменения, добавить тип объекта `chat` в схему уведомлений и тексты заголовков
- [ ] 19.4 Прогнать тесты из 19.1 и все тесты модуля `notifications`, зафиксировать, что они зелёные (green)

## 20. Electron: API файлов и прокси

- [ ] 20.1 Написать тесты:
  - прокси `cc-api-protocol` пропускает `/files`, а `/transcripts` по-прежнему получает 403;
  - `xhr-upload` (вынесенный из `tasks.api.ts`): прогресс, отмена, ошибки 413 и 415;
  - `files.api.ts`: `uploadFile` и `createDownloadLink`;
  - `schema.ts`: сообщение с `attachments` и `source`;
  - тесты вложений задач не меняются и остаются зелёными.

  Убедиться, что vitest видит тесты
- [ ] 20.2 Прогнать тесты из 20.1 и зафиксировать, что они падают (red)
- [ ] 20.3 Добавить `/files` в `ALLOWED_PREFIXES`, вынести XHR-загрузку в `lib/backend/xhr-upload.ts`, создать `files.api.ts` и `files.queries.ts`, обновить `schema.ts`
- [ ] 20.4 Прогнать тесты из 20.1 и все тесты `control-center`, зафиксировать, что они зелёные (green)

## 21. Electron: вложения в поле ввода (ui-design.md, раздел 1)

- [ ] 21.1 Написать тесты на `useComposerAttachments` и `Composer`. Макетов Pencil нет, вёрстка и тексты берутся из `ui-design.md`, раздел «1. Поле ввода с вложениями» и «Ключевые состояния экранов». Проверить:
  - добавление выбором и перетаскиванием, лимит 5 с плашкой;
  - прогресс, отмена и повтор;
  - тексты ошибок типа, размера и связи;
  - «Отправить» неактивна во время загрузки, отправка только с файлом;
  - `fileIds` уходят в запуск;
  - отказ запуска из-за удалённого файла переводит карточку в ошибку.

  Убедиться, что vitest видит тесты
- [ ] 21.2 Прогнать тесты из 21.1 и зафиксировать, что они падают (red)
- [ ] 21.3 Реализовать `use-composer-attachments.ts`, `ComposerAttachments`, кнопку «Прикрепить» и зону перетаскивания в `Composer`, передачу `fileIds` в `ChatRuntimeProvider` (`forwardedProps`)
- [ ] 21.4 Прогнать тесты из 21.1 и зафиксировать, что они зелёные (green), регрессий в тестах чата нет

## 22. Electron: файлы и сообщения системы в ленте (ui-design.md, разделы 2–3)

- [ ] 22.1 Написать тесты на `FileCard`, `MessageAttachments`, `UserMessage` и `AssistantMessage` по `ui-design.md`, разделы «2. Файлы в сообщениях» и «3. Сообщение системы в ленте»:
  - карточки в сообщении пользователя и после текста ответа;
  - карточка появляется по `CUSTOM file-attached` во время потока;
  - скачивание с исходным именем;
  - неактивная карточка «Срок хранения истёк»;
  - подпись сообщения системы без хода работы;
  - кнопка «Новое сообщение», когда лента пролистана вверх;
  - плашка ошибки скачивания.

  Убедиться, что vitest видит тесты
- [ ] 22.2 Прогнать тесты из 22.1 и зафиксировать, что они падают (red)
- [ ] 22.3 Реализовать компоненты и обработку `CUSTOM file-attached` в `ChatRuntimeProvider`, преобразование истории со вложениями и `source`
- [ ] 22.4 Прогнать тесты из 22.1 и зафиксировать, что они зелёные (green)

## 23. Electron: уведомления о расшифровке (ui-design.md, раздел 4)

- [ ] 23.1 Написать тесты:
  - `use-open-notification`: объект `chat` открывает раздел «Чаты» и этот чат, удалённый чат показывает «Чат не найден»;
  - `use-notifications-stream`: на `meeting-transcript.*` инвалидируется история открытого чата, если `object.id` совпадает;
  - иконки по типу в `NotificationItem`.

  Убедиться, что vitest видит тесты
- [ ] 23.2 Прогнать тесты из 23.1 и зафиксировать, что они падают (red)
- [ ] 23.3 Реализовать изменения в `features/notifications` и схеме уведомлений
- [ ] 23.4 Прогнать тесты из 23.1 и зафиксировать, что они зелёные (green)

## 24. Сквозная проверка

- [ ] 24.1 Написать backend e2e-тест сценария по образцу `tasks-flow.e2e.spec.ts`. Провайдер расшифровки и LLM подменяются, Postgres, Redis и MinIO настоящие. Шаги:
  - загрузка записи, затем запуск с `fileIds`;
  - событие расшифровки, затем сообщение системы с документом в истории и уведомление;
  - `PUT speakers`, затем новый документ;
  - извлечение задач и `propose_tasks`/`create_tasks` с другим постановщиком, итог с документом и `task.created-on-behalf`.

  Проверка — тест зелёный
- [ ] 24.2 Ручная проверка в Electron против dev-бэкенда под тестовым пользователем: реальная запись встречи от 10 минут, весь сценарий из proposal, скриншоты ключевых шагов. Проверка — все шаги пройдены, замечания записаны в этот пункт

## 25. Документация

- [ ] 25.1 Обновить `backend/src/modules/transcription/README.md` (сегменты, имена, специалист, документы, сообщение в чат), `assistant/README.md` (вложения, сообщения системы, ограничение одного экземпляра для `ActiveRunRegistry`), `control-center/README.md` (файлы в чате, префикс `/files`). Проверка — разделы есть и соответствуют коду

## 26. Code review

- [ ] 26.1 Запустить code-review (скилл `code-review`) по всем изменениям фичи — от коммита, с которого начат change, до текущего HEAD: соответствие стандартам проекта и specs этого change
- [ ] 26.2 Исправить замечания ревью (блокирующие и существенные обязательно; остальные — исправить или явно отклонить с обоснованием), результат зафиксировать коммитом
- [ ] 26.3 Повторить code-review по правкам из 26.2 и убедиться, что блокирующих замечаний нет; прогнать тесты и зафиксировать, что они зелёные
