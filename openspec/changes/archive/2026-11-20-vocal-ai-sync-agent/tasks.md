## 1. backend, домен: агрегат `Call` и порт `CallRepositoryPort`
> track: backend
> depends: —
> specs: vocal-ai-call-sync → «Дедупликация и консистентная запись синхронизированных звонков»
> arch: Entities/Call; Entities/CallMetricScore; Entities/CallTag; Entities/CallSummary; Value Objects/CallId; Value Objects/SyncWindow; Services/CallRepository
> files: backend/src/modules/vocal-ai/domain/value-objects/call-id.value-object.ts; backend/src/modules/vocal-ai/domain/value-objects/sync-window.value-object.ts; backend/src/modules/vocal-ai/domain/entities/call.entity.ts; backend/src/modules/vocal-ai/domain/entities/call-metric-score.entity.ts; backend/src/modules/vocal-ai/domain/entities/call-tag.entity.ts; backend/src/modules/vocal-ai/domain/entities/call-summary.entity.ts; backend/src/modules/vocal-ai/domain/ports/call-repository.port.ts
> frames: —

- [x] 1.1 TDD: `CallId` — валидирует положительное целое, отклоняет 0/отрицательные/нецелые значения. Тесты: `domain/value-objects/call-id.value-object.spec.ts`. Реализация: `domain/value-objects/call-id.value-object.ts`. Готово, когда тесты green и typecheck проходит
- [x] 1.2 TDD: `SyncWindow` — валидирует `fromAt < toAt`, отклоняет равные/перевёрнутые границы. Тесты: `domain/value-objects/sync-window.value-object.spec.ts`. Реализация: `domain/value-objects/sync-window.value-object.ts`. Готово, когда тесты green и typecheck проходит
- [x] 1.3 TDD: агрегат `Call` — метод замены дочерних записей (`CallMetricScore[]`, `CallTag[]`, `CallSummary[]`) отбрасывает дубликаты по `metricId`/`tagId` внутри одного `callId` и полностью заменяет предыдущий набор. Тесты: `domain/entities/call.entity.spec.ts`. Реализация: `domain/entities/call.entity.ts`, `domain/entities/call-metric-score.entity.ts`, `domain/entities/call-tag.entity.ts`, `domain/entities/call-summary.entity.ts`. Готово, когда тесты green и typecheck проходит
- [x] 1.4 Объявить `CallRepositoryPort` (abstract class: `upsertMany`, `findByFilter`, `aggregateStats`), без тестов: чистый контракт порта без логики. Реализация: `domain/ports/call-repository.port.ts`. Готово, когда typecheck проходит

## 2. backend, домен: агрегат `CallTranscript`, `SyncedProject` и оставшиеся порты
> track: backend
> depends: —
> specs: vocal-ai-call-sync → «Ленивая загрузка и постоянное кэширование транскрипции звонка»; vocal-ai-call-sync → «Отслеживание состояния синхронизации по проекту»
> arch: Entities/CallTranscript; Entities/CallTranscriptLine; Entities/SyncedProject; Services/CallTranscriptRepository; Services/SyncCursorRepository; Services/VocalAiGateway
> files: backend/src/modules/vocal-ai/domain/entities/call-transcript.entity.ts; backend/src/modules/vocal-ai/domain/entities/call-transcript-line.entity.ts; backend/src/modules/vocal-ai/domain/entities/synced-project.entity.ts; backend/src/modules/vocal-ai/domain/ports/call-transcript-repository.port.ts; backend/src/modules/vocal-ai/domain/ports/sync-cursor-repository.port.ts; backend/src/modules/vocal-ai/domain/ports/vocal-ai-gateway.port.ts
> frames: —

- [x] 2.1 TDD: агрегат `CallTranscript` — строки (`CallTranscriptLine[]`) принимаются только с монотонно возрастающим `lineIndex` без пропусков, иначе ошибка домена. Тесты: `domain/entities/call-transcript.entity.spec.ts`. Реализация: `domain/entities/call-transcript.entity.ts`, `domain/entities/call-transcript-line.entity.ts`. Готово, когда тесты green и typecheck проходит
- [x] 2.2 TDD: `SyncedProject` — обновление курсора (`advanceTo`) отклоняет значение раньше текущего `lastSyncedAt`. Тесты: `domain/entities/synced-project.entity.spec.ts`. Реализация: `domain/entities/synced-project.entity.ts`. Готово, когда тесты green и typecheck проходит
- [x] 2.3 Объявить `CallTranscriptRepositoryPort` (`exists`, `save`, `findByCallId`), `SyncCursorRepositoryPort` (`get`, `set`) и `VocalAiGatewayPort` (`login`, `refreshToken`, `listCalls`, `getCall`), без тестов: чистые контракты портов без логики. Реализация: `domain/ports/call-transcript-repository.port.ts`, `domain/ports/sync-cursor-repository.port.ts`, `domain/ports/vocal-ai-gateway.port.ts`. Готово, когда typecheck проходит

## 3. backend, инфраструктура: `VocalAiGateway` (внешний API)
> track: backend
> depends: 2
> specs: vocal-ai-call-sync → «Авторизация в VocalAI через SSO Синергии»; vocal-ai-call-sync → «Автоматическое обновление access-токена»; vocal-ai-call-sync → «Устойчивость к сбоям внешнего API»
> arch: Services/VocalAiGateway
> files: backend/src/modules/vocal-ai/infrastructure/vocal-ai/vocal-ai-gateway.adapter.ts; backend/src/shared/config/env.schema.ts; backend/.env.example
> frames: —

- [x] 3.1 TDD: `VocalAiGateway` выполняет двухшаговый логин (SSO Синергии → обмен на токен VocalAI) и сохраняет access/refresh токены в памяти; при ошибке SSO — ошибка пробрасывается с контекстом, токены не сохраняются. Тесты: `infrastructure/vocal-ai/vocal-ai-gateway.adapter.spec.ts` (мок HTTP-клиента). Реализация: `infrastructure/vocal-ai/vocal-ai-gateway.adapter.ts`, плюс `VOCAL_AI_SYNERGY_LOGIN`/`VOCAL_AI_SYNERGY_PASSWORD`/`VOCAL_AI_BASE_URL` в `env.schema.ts` и `.env.example`. Готово, когда тесты green и typecheck проходит
- [x] 3.2 TDD: на ответе 401 от любого метода `VocalAiGateway` выполняет `refreshToken` и повторяет исходный запрос один раз; параллельные вызовы, упавшие в 401 одновременно, ждут один и тот же in-flight refresh (single-flight), а не плодят повторные логины. Тесты: тот же файл. Готово, когда тесты green и typecheck проходит
- [x] 3.3 TDD: если `refreshToken` также завершается ошибкой — выполняется полный повторный логин через SSO; если и он не проходит, ошибка пробрасывается наружу без побочных изменений состояния. Тесты: тот же файл. Готово, когда тесты green и typecheck проходит
- [x] 3.4 TDD: `listCalls(projectId, window)` отправляет `POST /api/calls/project/{id}` с `startDate/endDate` для `callWindow` и с `scoreStartDate/scoreEndDate` (+ дублирующие `dateFromScore/dateToScore`) для `scoreWindow`, возвращает типизированный список `CallDto[]`; `getCall(callId, projectId)` вызывает `GET /api/call/{id}?project_id=` и возвращает карточку с транскрипцией. Тесты: тот же файл. Готово, когда тесты green и typecheck проходит
- [x] 3.5 TDD: сетевая ошибка или 5xx от VocalAI API приводят к retry с backoff ограниченное число раз, после чего ошибка пробрасывается наружу (не поглощается). Тесты: тот же файл. Готово, когда тесты green и typecheck проходит

## 4. backend, инфраструктура: persistence (миграция + репозитории)
> track: backend
> depends: 1, 2
> specs: vocal-ai-call-sync → «Дедупликация и консистентная запись синхронизированных звонков»; vocal-ai-call-sync → «Отслеживание состояния синхронизации по проекту»; vocal-ai-call-sync → «Ленивая загрузка и постоянное кэширование транскрипции звонка»
> arch: Services/CallRepository; Services/CallTranscriptRepository; Services/SyncCursorRepository
> files: backend/db/migrations/040_vocal_ai_calls.sql; backend/src/database/postgres/vocal-ai-calls-migration.spec.ts; backend/src/modules/vocal-ai/infrastructure/persistence/slonik-call.repository.ts; backend/src/modules/vocal-ai/infrastructure/persistence/slonik-call-transcript.repository.ts; backend/src/modules/vocal-ai/infrastructure/persistence/slonik-sync-cursor.repository.ts
> frames: —

- [x] 4.1 TDD: миграция `040_vocal_ai_calls.sql` создаёт таблицы `vocal_ai_projects`, `vocal_ai_calls`, `vocal_ai_call_metric_scores`, `vocal_ai_call_tags`, `vocal_ai_call_summaries`, `vocal_ai_call_transcript_lines` с ожидаемыми столбцами и FK на `vocal_ai_calls.call_id`; накатывается и откатывается без ошибок. Тесты: `src/database/postgres/vocal-ai-calls-migration.spec.ts` (по образцу существующих `*-migration.spec.ts`). Реализация: `db/migrations/040_vocal_ai_calls.sql`. Готово, когда тесты green (пропускаются без `PROGRAMS_ETL_TEST_ADMIN_URL`, иначе обязательны) и typecheck проходит
- [x] 4.2 TDD: `CallRepository.upsertMany` вставляет новые звонки и полностью заменяет дочерние записи (метрики/теги/саммари) существующих звонков при повторном вызове с другим набором данных, без потери звонков, не затронутых текущим upsert. Тесты: `infrastructure/persistence/slonik-call.repository.spec.ts`. Реализация: `infrastructure/persistence/slonik-call.repository.ts`. Готово, когда тесты green и typecheck проходит
- [x] 4.3 TDD: `CallRepository.findByFilter` фильтрует по `projectId`, менеджеру, диапазону дат, диапазону `totalScore`, `tagId`, `metricId` (комбинация AND); `CallRepository.aggregateStats` считает `count`/`averageScore`/`problemShare` по тому же фильтру. Тесты: тот же файл. Реализация: тот же файл. Готово, когда тесты green и typecheck проходит
- [x] 4.4 TDD: `CallTranscriptRepository.exists`/`save`/`findByCallId` — `save` идемпотентно перезаписывает строки по `callId` (без дублей при повторном вызове), `exists` корректно отражает наличие. Тесты: `infrastructure/persistence/slonik-call-transcript.repository.spec.ts`. Реализация: `infrastructure/persistence/slonik-call-transcript.repository.ts`. Готово, когда тесты green и typecheck проходит
- [x] 4.5 TDD: `SyncCursorRepository.get`/`set` — курсор хранится независимо на каждый `projectId`, `get` для несинхронизированного проекта возвращает `null`. Тесты: `infrastructure/persistence/slonik-sync-cursor.repository.spec.ts`. Реализация: `infrastructure/persistence/slonik-sync-cursor.repository.ts`. Готово, когда тесты green и typecheck проходит

## 5. backend, application: инкрементальная синхронизация и backfill
> track: backend
> depends: 3, 4
> specs: vocal-ai-call-sync → «Инкрементальная синхронизация по дате звонка»; vocal-ai-call-sync → «Инкрементальная синхронизация по дате оценки»; vocal-ai-call-sync → «Дедупликация и консистентная запись синхронизированных звонков»; vocal-ai-call-sync → «Отслеживание состояния синхронизации по проекту»
> arch: Services/SyncProjectCallsUseCase; Services/BackfillProjectCallsUseCase
> files: backend/src/modules/vocal-ai/application/use-cases/sync-project-calls.use-case.ts; backend/src/modules/vocal-ai/application/use-cases/backfill-project-calls.use-case.ts
> frames: —

- [x] 5.1 TDD: `SyncProjectCallsUseCase.execute` при существующем курсоре делает два вызова `VocalAiGatewayPort.listCalls` (по `callWindow` и по `scoreWindow`, оба — `[lastSyncedAt, now)`), объединяет результаты в один набор уникальных звонков по `callId`, передаёт в `CallRepositoryPort.upsertMany` и обновляет курсор на `now` только после успешного upsert. Тесты: `application/use-cases/sync-project-calls.use-case.spec.ts` (test doubles портов). Реализация: `application/use-cases/sync-project-calls.use-case.ts`. Готово, когда тесты green и typecheck проходит
- [x] 5.2 TDD: при отсутствии курсора для проекта `SyncProjectCallsUseCase.execute` делегирует в `BackfillProjectCallsUseCase` вместо обычного инкремента. Тесты: тот же файл. Готово, когда тесты green и typecheck проходит
- [x] 5.3 TDD: `BackfillProjectCallsUseCase.execute` постранично выгружает всю историю проекта через `VocalAiGatewayPort.listCalls` (без нижней границы даты), upsert-ит каждую страницу, и выставляет курсор синхронизации только после успешного завершения всей выгрузки (частичный сбой не продвигает курсор). Тесты: `application/use-cases/backfill-project-calls.use-case.spec.ts`. Реализация: `application/use-cases/backfill-project-calls.use-case.ts`. Готово, когда тесты green и typecheck проходит

## 6. backend, application: тулы агента — запросы к локальным данным
> track: backend
> depends: 3, 4
> specs: vocal-ai-agent-tools → «Список звонков с фильтрацией из локального хранилища»; vocal-ai-agent-tools → «Детали звонка без транскрипции»; vocal-ai-agent-tools → «Транскрипция звонка с ленивой подгрузкой»; vocal-ai-agent-tools → «Агрегированная статистика по звонкам»
> arch: Services/ListCallsUseCase; Services/GetCallDetailUseCase; Services/GetCallTranscriptUseCase; Services/GetCallStatsUseCase
> files: backend/src/modules/vocal-ai/application/use-cases/list-calls.use-case.ts; backend/src/modules/vocal-ai/application/use-cases/get-call-detail.use-case.ts; backend/src/modules/vocal-ai/application/use-cases/get-call-transcript.use-case.ts; backend/src/modules/vocal-ai/application/use-cases/get-call-stats.use-case.ts
> frames: —

- [x] 6.1 TDD: `ListCallsUseCase.execute(filter)` вызывает `CallRepositoryPort.findByFilter` и возвращает пустой список без ошибки, если ничего не найдено. Тесты: `application/use-cases/list-calls.use-case.spec.ts`. Реализация: `application/use-cases/list-calls.use-case.ts`. Готово, когда тесты green и typecheck проходит
- [x] 6.2 TDD: `GetCallDetailUseCase.execute(callId)` возвращает метрики/теги/саммари/оценку звонка без транскрипции; для неизвестного `callId` — явная доменная ошибка "звонок не найден" (не обращается к `VocalAiGatewayPort`). Тесты: `application/use-cases/get-call-detail.use-case.spec.ts`. Реализация: `application/use-cases/get-call-detail.use-case.ts`. Готово, когда тесты green и typecheck проходит
- [x] 6.3 TDD: `GetCallTranscriptUseCase.execute(callId, projectId)` — если `CallTranscriptRepositoryPort.exists` истинно, возвращает сохранённые строки без вызова `VocalAiGatewayPort`; иначе вызывает `getCall`, сохраняет через `save` и возвращает результат; для неизвестного `callId` — явная ошибка. Тесты: `application/use-cases/get-call-transcript.use-case.spec.ts`. Реализация: `application/use-cases/get-call-transcript.use-case.ts`. Готово, когда тесты green и typecheck проходит
- [x] 6.4 TDD: `GetCallStatsUseCase.execute(filter)` вызывает `CallRepositoryPort.aggregateStats` с тем же типом фильтра, что `ListCallsUseCase`. Тесты: `application/use-cases/get-call-stats.use-case.spec.ts`. Реализация: `application/use-cases/get-call-stats.use-case.ts`. Готово, когда тесты green и typecheck проходит

## 7. backend, инфраструктура/очередь: планировщик и процессор синхронизации
> track: backend
> depends: 5
> specs: vocal-ai-call-sync → «Устойчивость к сбоям внешнего API»; vocal-ai-call-sync → «Отслеживание состояния синхронизации по проекту»
> arch: Services/VocalAiSyncScheduler; Services/VocalAiSyncProcessor
> files: backend/src/modules/vocal-ai/infrastructure/queue/queue.constants.ts; backend/src/modules/vocal-ai/infrastructure/queue/vocal-ai-sync-scheduler.ts; backend/src/modules/vocal-ai/interface/queue/vocal-ai-sync.processor.ts; backend/src/shared/config/env.schema.ts; backend/.env.example
> frames: —

- [x] 7.1 TDD: `VocalAiSyncScheduler.register` регистрирует через `queue.upsertJobScheduler` отдельный повторяющийся job на каждый `projectId` из `VOCAL_AI_PROJECT_IDS`; при пустом списке — ни одного job не регистрируется. Тесты: `infrastructure/queue/vocal-ai-sync-scheduler.spec.ts` (по образцу `deal-sync-scheduler.spec.ts`). Реализация: `infrastructure/queue/vocal-ai-sync-scheduler.ts`, `infrastructure/queue/queue.constants.ts`, плюс `VOCAL_AI_PROJECT_IDS`/`VOCAL_AI_SYNC_INTERVAL_MINUTES`/`VOCAL_AI_SYNC_ATTEMPTS`/`VOCAL_AI_SYNC_BACKOFF_MS` в `env.schema.ts`/`.env.example`. Готово, когда тесты green и typecheck проходит
- [x] 7.2 TDD: `VocalAiSyncProcessor.process` вызывает `SyncProjectCallsUseCase.execute` для `projectId` своего job-а и логирует результат (`PinoLogger`, по правилам `logging.md`). Тесты: `interface/queue/vocal-ai-sync.processor.spec.ts` (по образцу `deal-sync.processor.spec.ts`). Реализация: `interface/queue/vocal-ai-sync.processor.ts`. Готово, когда тесты green и typecheck проходит
- [x] 7.3 TDD: обработчик `failed`-события процессора логирует ошибку job-а (включая `projectId`) и не прерывает работу BullMQ-воркера; ошибка одного job-а (одного проекта) не влияет на job другого проекта. Тесты: тот же файл. Готово, когда тесты green и typecheck проходит

## 8. backend, interface/agent: инструменты агента и модуль
> track: backend
> depends: 6
> specs: vocal-ai-agent-tools → «Список звонков с фильтрацией из локального хранилища»; vocal-ai-agent-tools → «Детали звонка без транскрипции»; vocal-ai-agent-tools → «Транскрипция звонка с ленивой подгрузкой»; vocal-ai-agent-tools → «Агрегированная статистика по звонкам»; vocal-ai-agent-tools → «Изоляция инструментов агента от внешнего API»
> arch: Services/VocalAiAgentCapability
> files: backend/src/modules/vocal-ai/interface/agent/vocal-ai-tools.ts; backend/src/modules/vocal-ai/interface/agent/vocal-ai-agent.capability.ts; backend/src/modules/vocal-ai/vocal-ai.module.ts; backend/src/modules/vocal-ai/vocal-ai.tokens.ts
> frames: —

- [x] 8.1 TDD: тул `list_calls` (создаваемый `createVocalAiTools`) вызывает только `ListCallsUseCase` и не имеет доступа к `VocalAiGatewayPort` в своих зависимостях; валидирует входные фильтры zod-схемой. Тесты: `interface/agent/vocal-ai-tools.spec.ts` (по образцу `task-tools.spec.ts`). Реализация: `interface/agent/vocal-ai-tools.ts`. Готово, когда тесты green и typecheck проходит
- [x] 8.2 TDD: тул `get_call` вызывает `GetCallDetailUseCase` и возвращает читаемую для модели ошибку, если звонок не найден (без падения с необработанным исключением). Тесты: тот же файл. Готово, когда тесты green и typecheck проходит
- [x] 8.3 TDD: тул `get_call_transcript` вызывает `GetCallTranscriptUseCase` (единственный путь, где тулы агента могут инициировать обращение к внешнему API — опосредованно через use case) и возвращает реплики транскрипции. Тесты: тот же файл. Готово, когда тесты green и typecheck проходит
- [x] 8.4 TDD: тул `get_call_stats` вызывает `GetCallStatsUseCase` с теми же фильтрами, что `list_calls`. Тесты: тот же файл. Готово, когда тесты green и typecheck проходит
- [x] 8.5 `VocalAiAgentCapability` (по образцу `TasksAgentCapability`) регистрирует `createVocalAiTools` в `createAgent`; `vocal-ai.module.ts`/`vocal-ai.tokens.ts` подключают все провайдеры модуля (gateway, репозитории, use cases, scheduler, processor, capability) в DI, без тестов: сборка модуля без собственной логики. Проверка: Nest-приложение успешно поднимается локально (модуль резолвится в DI-контейнере без ошибок), typecheck и lint проходят

## 9. Интеграционная проверка и документация
> track: integration
> depends: 7, 8
> specs: —
> arch: —
> files: backend/.env.example; backend/src/modules/vocal-ai/vocal-ai.module.spec.ts (или аналогичный сквозной тест)
> frames: —

- [x] 9.1 Свериться, что все новые переменные окружения модуля (`VOCAL_AI_SYNERGY_LOGIN`, `VOCAL_AI_SYNERGY_PASSWORD`, `VOCAL_AI_BASE_URL`, `VOCAL_AI_PROJECT_IDS`, `VOCAL_AI_SYNC_INTERVAL_MINUTES`, `VOCAL_AI_SYNC_ATTEMPTS`, `VOCAL_AI_SYNC_BACKOFF_MS`) описаны в `backend/.env.example` с комментариями и без значений секретов, без тестов: документация/конфиг. Готово, когда `npm run typecheck` в `backend/` проходит
- [x] 9.2 Сквозной сценарий на тестовой БД: `BackfillProjectCallsUseCase` на фикстурах VocalAI (через test double `VocalAiGatewayPort`) наполняет хранилище → `ListCallsUseCase`/`GetCallStatsUseCase` видят эти звонки по фильтру → `GetCallTranscriptUseCase` лениво подгружает и кэширует транскрипт одного из них → повторный вызов не обращается к gateway повторно. Тесты: интеграционный спек модуля (например `src/modules/vocal-ai/vocal-ai.integration.spec.ts`), пропускается без `PROGRAMS_ETL_TEST_ADMIN_URL`, иначе обязателен green
- [x] 9.3 Прогнать `npx vitest run src/modules/vocal-ai` → `npm run typecheck` → `npm run lint` → полный `npm test` один раз в конце; все зелёные, регрессия не нарушена

## 11. backend, фикс находок ревью (раунд 2)
> track: backend
> depends: 4, 5, 6, 8
> specs: vocal-ai-call-sync → «Дедупликация и консистентная запись синхронизированных звонков»; vocal-ai-call-sync → «Отслеживание состояния синхронизации по проекту»; vocal-ai-call-sync → «Инкрементальная синхронизация по дате звонка»; vocal-ai-agent-tools → «Список звонков с фильтрацией из локального хранилища»; vocal-ai-agent-tools → «Транскрипция звонка с ленивой подгрузкой»
> arch: Services/CallRepository; Services/SyncCursorRepository; Services/VocalAiGateway; Services/SyncProjectCallsUseCase; Services/BackfillProjectCallsUseCase; Services/ListCallsUseCase; Services/GetCallTranscriptUseCase
> files: backend/src/modules/vocal-ai/domain/ports/call-repository.port.ts; backend/src/modules/vocal-ai/infrastructure/persistence/slonik-call.repository.ts; backend/src/modules/vocal-ai/infrastructure/persistence/slonik-sync-cursor.repository.ts; backend/src/modules/vocal-ai/infrastructure/vocal-ai/vocal-ai-gateway.adapter.ts; backend/src/modules/vocal-ai/application/use-cases/sync-project-calls.use-case.ts; backend/src/modules/vocal-ai/application/use-cases/backfill-project-calls.use-case.ts; backend/src/modules/vocal-ai/application/use-cases/list-calls.use-case.ts; backend/src/modules/vocal-ai/application/use-cases/get-call-transcript.use-case.ts; backend/src/modules/vocal-ai/interface/agent/vocal-ai-tools.ts; backend/src/modules/vocal-ai/vocal-ai.module.ts
> frames: —

- [x] 11.1 TDD: при частичном сбое записи звонков курсор синхронизации не продвигается за несохранённые звонки. `CallRepositoryPort.upsertMany` сообщает вызывающему, какие `callId` не удалось записать (а не только логирует), и `SyncProjectCallsUseCase`/`BackfillProjectCallsUseCase` не продвигают курсор дальше момента, покрывающего несохранённые звонки — они должны быть запрошены повторно на следующем цикле/странице. Тесты: `infrastructure/persistence/slonik-call.repository.spec.ts` (или существующий partial-failure spec), `application/use-cases/sync-project-calls.use-case.spec.ts`, `application/use-cases/backfill-project-calls.use-case.spec.ts`. Реализация: `domain/ports/call-repository.port.ts`, `infrastructure/persistence/slonik-call.repository.ts`, `application/use-cases/sync-project-calls.use-case.ts`, `application/use-cases/backfill-project-calls.use-case.ts`. Готово, когда тесты green и typecheck проходит
- [x] 11.2 TDD: `list_calls` не молчит об усечении результата. `CallRepositoryPort.findByFilter` принимает явный `limit`/`offset` от вызывающего, а инструмент `list_calls` возвращает реальное общее количество подходящих звонков (не длину возвращённого массива) и явный признак, что результат обрезан лимитом, когда это так. Тесты: `infrastructure/persistence/slonik-call.repository.spec.ts`, `application/use-cases/list-calls.use-case.spec.ts`, `interface/agent/vocal-ai-tools.spec.ts`. Реализация: `domain/ports/call-repository.port.ts`, `infrastructure/persistence/slonik-call.repository.ts`, `application/use-cases/list-calls.use-case.ts`, `interface/agent/vocal-ai-tools.ts`. Готово, когда тесты green и typecheck проходит
- [x] 11.3 TDD: `get_call_transcript` не требует от модели лишний `projectId`. Параметр убирается из сигнатуры `GetCallTranscriptUseCase.execute` и из zod-схемы тула `get_call_transcript` (реальный `projectId` и так берётся из уже найденной записи звонка). Тесты: `application/use-cases/get-call-transcript.use-case.spec.ts`, `interface/agent/vocal-ai-tools.spec.ts`. Реализация: `application/use-cases/get-call-transcript.use-case.ts`, `interface/agent/vocal-ai-tools.ts`. Готово, когда тесты green и typecheck проходит
- [x] 11.4 TDD: `SyncCursorRepository.set` отклоняет попытку установить курсор проекта раньше уже сохранённого значения — защита от регресса при гонке параллельных job одного проекта (например, во время долгого backfill). Тесты: `infrastructure/persistence/slonik-sync-cursor.repository.spec.ts`. Реализация: `infrastructure/persistence/slonik-sync-cursor.repository.ts`. Готово, когда тесты green и typecheck проходит
- [x] 11.5 TDD: `VocalAiGateway.listCalls` гарантированно завершает пагинацию за ограниченное число страниц, даже если сервер не возвращает `totalCalls` и всегда отдаёт полную страницу — жёсткий потолок страниц с явной ошибкой вместо бесконечного цикла. Тесты: `infrastructure/vocal-ai/vocal-ai-gateway.adapter.spec.ts`. Реализация: `infrastructure/vocal-ai/vocal-ai-gateway.adapter.ts`. Готово, когда тесты green и typecheck проходит
- [x] 11.6 Привести затронутые ревью файлы к `code-style.md`: порядок импортов в `vocal-ai.module.ts` (shared-импорты перед относительными), убрать документирующие JSDoc-комментарии и смешение языков, убрать `as unknown as` без обоснования в тестах персистентности (или удалить бессодержательный тест на жёсткий максимум лимита, если он поглощается тестами из 11.2), без тестов: стилевая правка без изменения поведения. Готово, когда `npm run lint` чист и предыдущие тесты остаются green

## 10. Code review
> track: review
> depends: 1, 2, 3, 4, 5, 6, 7, 8, 9, 11

- [x] 10.1 Code review всех изменений change от base commit по измерениям: соответствие specs/design, стандарты проекта, корректность (выполняет фаза Review workflow `apply-openspec-change`) — Ревью выполнено workflow apply-openspec-change (коммиты 003df01, 98802ff).
- [x] 10.2 Исправить blocking и major (дефекты поведения — через тест, воспроизводящий ошибку), не больше 2 раундов ревью; оставшиеся minor перечислить в итоге; регрессия зелёная — Исправления по ревью: 003df01, 98802ff, dfeff76.
