<!--
  Artifact: tasks (backend)
  Requires: proposal, design, architecture

  TDD-шаблон для каждой содержательной единицы:
  1. Сначала написать тесты на ожидаемое поведение.
  2. Запустить их и зафиксировать ожидаемый red из-за отсутствующей реализации.
  3. Реализовать функциональность.
  4. Получить green на целевых и соседних тестах.

  Исключения без TDD допустимы только для механической настройки, документации
  и артефактов без ветвящейся логики; причина указывается прямо в задаче.
-->

## 1. Каркас модуля и конфигурация

- [x] 1.1 Создать слоистый каркас `programs-etl` (`domain`, `application`, `infrastructure`, `interface`) и проверить, что структура не импортирует внешние SDK в domain/application
- [x] 1.2 Добавить совместимые зависимости Deep Agents JS и Google Sheets SDK, установить lockfile и проверить успешное выполнение `npm install` в `backend`
- [x] 1.3 Добавить env-конфигурацию включения scheduler, cron-интервала, concurrency, BullMQ attempts/backoff, OpenAI model/max steps/timeout и лимита ячеек Sheets; отдельные unit-тесты не нужны, потому что это декларативная конфигурация без бизнес-ветвлений — проверить штатную загрузку и ошибки отсутствующих обязательных значений существующим config-тестом
- [x] 1.4 Подключить `ProgramsEtlModule` к composition root с scheduler, выключенным по умолчанию, и проверить `npm run typecheck` и сборку NestJS

## 2. Доменная модель каталога (TDD)

- [x] 2.1 Написать тесты на `Organization`, `Program`, `Offer`, `Price`, `EntranceRequirement` и VO `ProgramLevel`, `ProgramStatus`, `StudyForm`, `BaseEducation`, `Money`, `PriceKind`: допустимые значения, неотрицательную цену и требования каталога из architecture
- [x] 2.2 Запустить тесты из 2.1 и зафиксировать ожидаемый red: чистые доменные типы и инварианты ещё не реализованы
- [x] 2.3 Реализовать чистую доменную модель каталога без NestJS, ORM, BullMQ, LangChain, Google API и persistence-полей ETL
- [x] 2.4 Прогнать тесты из 2.1 до green и выполнить соседние domain-тесты без регрессий

## 3. Application workflow models и порты (TDD)

- [x] 3.1 Написать тесты на `ProgramsSyncRunRecord`, допустимые переходы `queued → running → succeeded/failed`, `ProgramsGroup`, `GroupSource`, fingerprints, provenance, `ProgramMatchKey` с вариантами `coded/titled`, mutation plan и application errors
- [x] 3.2 Запустить тесты из 3.1 и зафиксировать ожидаемый red из-за отсутствующих workflow models и переходов
- [x] 3.3 Реализовать application models, commands/results и порты `GroupRegistryPort`, `SheetsReaderPort`, `ProgramsAgentPort`, `CatalogQueryPort`, `CatalogWriterPort`, `SourceStateRepositoryPort`, `SyncRunStorePort`, `ProgramsSyncQueuePort`, `ProgramsSyncMetricsPort` с сигнатурами из architecture
- [x] 3.4 Прогнать тесты из 3.1 до green и `npm run typecheck`, подтвердив отсутствие SDK-типов во входах и выходах портов

## 4. Реестр групп из groups.json (TDD)

- [x] 4.1 Написать тесты `JsonGroupRegistry`: стабильный порядок источников, чтение metadata, `listScheduledGroups()` только для `ready`, `getGroup()`, исключение `needs_matching/out_of_scope_schema/deferred` и ошибка некорректного определения
- [x] 4.2 Запустить тесты из 4.1 и зафиксировать ожидаемый red: адаптер реестра отсутствует
- [x] 4.3 Реализовать `JsonGroupRegistry` над существующим `price-policy-rag/tabels-links/groups.json` и зарегистрировать его за `GroupRegistryPort`
- [x] 4.4 Прогнать тесты из 4.1 до green и проверить, что ни одна не-`ready` группа не попадает в плановый scan

## 5. Google Sheets reader и fingerprints (TDD)

- [x] 5.1 Написать контрактные тесты `GoogleSheetsReader` на batch-read fingerprints, стабильный hash форматированных значений и координат, ограниченный A1 range, сохранение пустых позиций, row numbers, пагинацию через `truncated/nextRange` и классификацию ошибок
- [x] 5.2 Запустить тесты из 5.1 и зафиксировать ожидаемый red: Sheets adapter и fingerprint algorithm отсутствуют
- [x] 5.3 Реализовать `SheetsReaderPort.readFingerprints/readRange` через Google Sheets SDK с bounded ranges, лимитом ячеек и коротким retry временных ошибок внутри tool call
- [x] 5.4 Прогнать тесты из 5.1 до green и контрактный regression-набор с подменённым Google API

## 6. Миграции истории запусков и provenance (TDD)

- [x] 6.1 Написать интеграционные тесты миграций после `008`: таблица истории run с `previous_run_id`, статусами и timestamps; типизированные catalog-source link tables с реальными FK к каталогу, `raw_row`, `group_id` и `last_seen_run_id`; сохранность миграций `004`–`008`
- [x] 6.2 Запустить тесты из 6.1 на чистой тестовой PostgreSQL и зафиксировать ожидаемый red: новые таблицы отсутствуют
- [x] 6.3 Добавить новые последовательные SQL-миграции без удаления `source_row_id`, `sheet_mapping` и существующей схемы; не вводить транзакцию на всю ETL-группу
- [x] 6.4 Прогнать тесты из 6.1 до green, повторно применить migrator для проверки идемпотентности и проверить FK/индексы через системный каталог PostgreSQL

## 7. SourceStateRepository (TDD)

- [x] 7.1 Написать тесты `PostgresSourceStateRepository` на `findSuccessfulFingerprints()` и `markSuccessfullyProcessed()`, включая неизвестный источник и запрет продвижения fingerprint до явного успешного вызова
- [x] 7.2 Запустить тесты из 7.1 и зафиксировать ожидаемый red: repository adapter отсутствует
- [x] 7.3 Реализовать `SourceStateRepositoryPort` поверх существующей `source_sheet`, не раскрывая persistence model application-слою
- [x] 7.4 Прогнать тесты из 7.1 до green и соседние persistence-тесты без регрессий

## 8. SyncRunStore и read models (TDD)

- [x] 8.1 Написать тесты `PostgresSyncRunStore` на `createQueued`, `markRunning`, `markSucceeded`, `markFailed`, связь retry через `previousRunId`, получение одной записи и cursor-list с фильтрами
- [x] 8.2 Запустить тесты из 8.1 и зафиксировать ожидаемый red: run store отсутствует
- [x] 8.3 Реализовать `SyncRunStorePort` и persistence mapping `ProgramsSyncRunRecord`, сохраняя только metadata запуска и краткую ошибку без payload листов
- [x] 8.4 Прогнать тесты из 8.1 до green и проверить допустимые application-переходы на реальной тестовой БД

## 9. BullMQ queue adapter и scheduling service (TDD)

- [x] 9.1 Написать тесты `BullProgramsSyncQueue` и `ScheduleProgramsGroupSyncService.schedule()`: создание queued-run до enqueue, payload `sync-group`, `jobId = programs-etl:sync:<runId>`, scheduled/retry triggers, `previousRunId` и обработка ошибки enqueue
- [x] 9.2 Запустить тесты из 9.1 и зафиксировать ожидаемый red: queue adapter и scheduling service отсутствуют
- [x] 9.3 Реализовать `ProgramsSyncQueuePort`, queue constants/DTO и `ScheduleProgramsGroupSyncService`, централизующий создание run и постановку job для scan/retry
- [x] 9.4 Прогнать тесты из 9.1 до green и соседние BullMQ adapter-тесты без регрессий

## 10. Hourly source scan (TDD)

- [x] 10.1 Написать тесты `ScanProgramSourcesUseCase.execute()`: только `ready`, неизменившийся лист не создаёт run, изменившиеся листы группируются в одну job на группу, несколько групп получают отдельные runs, returned counters корректны
- [x] 10.2 Запустить тесты из 10.1 и зафиксировать ожидаемый red: scan use case отсутствует
- [x] 10.3 Реализовать `ScanProgramSourcesUseCase` через registry, Sheets fingerprints, source state и `ScheduleProgramsGroupSyncService`, не продвигая successful fingerprint на фазе scan
- [x] 10.4 Прогнать тесты из 10.1 до green и проверить regression для повторного scan после failed-run

## 11. CatalogQueryRepository (TDD)

- [x] 11.1 Написать тесты `CatalogQueryRepository` на `searchRecords`, `getRecord`, `listSourceRecords`: ограниченные кандидаты, поля `ProgramMatchKey`, связанные источники, поиск по source/row, секционное получение текста и ошибки not-found/unavailable
- [x] 11.2 Запустить тесты из 11.1 и зафиксировать ожидаемый red: read-only catalog adapter отсутствует
- [x] 11.3 Реализовать параметризованные read-only запросы к существующему каталогу и typed source links без передачи SQL/table names наружу
- [x] 11.4 Прогнать тесты из 11.1 до green и проверить, что query adapter не предоставляет методов записи

## 12. Agent tools factory (TDD)

- [x] 12.1 Написать тесты tools `list_group_sources`, `read_sheet_range`, `search_catalog_records`, `get_catalog_record`, `list_source_records`: scope по `groupId/runId`, точные input/output contracts, запрет чужого `sourceId`, bounded ranges, error codes и отсутствие write/SQL tools
- [x] 12.2 Запустить тесты из 12.1 и зафиксировать ожидаемый red: factory и tools отсутствуют
- [x] 12.3 Реализовать tools factory поверх application ports; логировать metadata tool calls без значений ячеек, полного prompt и полных записей каталога
- [x] 12.4 Прогнать тесты из 12.1 до green и подтвердить, что `recordId` для update может поступить только из catalog tools текущего запуска

## 13. Deep Agents programs adapter (TDD)

- [x] 13.1 Написать контрактные тесты `DeepAgentsProgramsAgent`: новый agent/tool scope на каждый run, `createDeepAgent` + `ChatOpenAI`, конфигурируемые model/max steps/timeout, structured mutation plan `create/update`, provenance и корректная передача tool errors
- [x] 13.2 Запустить тесты из 13.1 с mock model и зафиксировать ожидаемый red: agent adapter и response format отсутствуют
- [x] 13.3 Реализовать `ProgramsAgentPort.buildMutationPlan()` с prompt и `responseFormat`, не добавляя отдельный детерминированный parser, проверки полноты/точных значений, filesystem backend, subagents или QuickJS
- [x] 13.4 Прогнать тесты из 13.1 до green и проверить timeout/step-limit regression без реального вызова OpenAI

## 14. CatalogWriterRepository и source links (TDD)

- [x] 14.1 Написать тесты `CatalogWriterRepository.applyPlan()`: идемпотентный create через `ProgramMatchKey`, update только по `recordId`, разрешение локальных ключей зависимостей, запись reference data/content sections, typed source links с несколькими источниками, отсутствие delete и group-wide transaction
- [x] 14.2 Запустить тесты из 14.1 и зафиксировать ожидаемый red: writer adapter отсутствует
- [x] 14.3 Реализовать применение mutation plan к существующим catalog tables, инфраструктурное разбиение `ProgramContentSection` в `content_chunk` и provenance links; не давать агенту прямой SQL/write tool
- [x] 14.4 Прогнать тесты из 14.1 до green и persistence regression-набор на create/update/retry без дублей

## 15. Group synchronization use case (TDD)

- [x] 15.1 Написать тесты `SyncProgramsGroupUseCase.execute()`: загрузка group/run, `markRunning`, agent plan, writer, продвижение fingerprints только после успешной записи, `markSucceeded`; failed status и неизменённый fingerprint при ошибках Sheets/agent/writer
- [x] 15.2 Запустить тесты из 15.1 и зафиксировать ожидаемый red: orchestration use case отсутствует
- [x] 15.3 Реализовать `SyncProgramsGroupUseCase` через application ports с результатом `ProgramsSyncResult`, без transaction boundary на всю группу
- [x] 15.4 Прогнать тесты из 15.1 до green и соседние scan/scheduling tests без регрессий

## 16. Retry и run queries (TDD)

- [x] 16.1 Написать тесты `RetryProgramsSyncUseCase`, `ListProgramsSyncRunsQuery`, `GetProgramsSyncRunQuery`: retry только failed-run, новый run с прежними changed sources и `previousRunId`, rejection остальных статусов, cursor pagination и not-found
- [x] 16.2 Запустить тесты из 16.1 и зафиксировать ожидаемый red: retry/query handlers отсутствуют
- [x] 16.3 Реализовать retry через `ScheduleProgramsGroupSyncService` и read handlers поверх `SyncRunStorePort`; не добавлять HTTP/CLI ручного запуска групп
- [x] 16.4 Прогнать тесты из 16.1 до green и run-store regression-набор

## 17. Scheduler, processors и NestJS wiring (TDD)

- [x] 17.1 Написать тесты `ProgramsScanScheduler`, `ScanSourcesProcessor`, `SyncGroupProcessor` и module wiring: hourly job scheduler, защита от overlapping scan, точный queue payload, вызов нужного use case, retryable/permanent error mapping
- [x] 17.2 Запустить тесты из 17.1 и зафиксировать ожидаемый red: driver adapters и DI bindings отсутствуют
- [x] 17.3 Реализовать BullMQ scheduler/processors, DI-токены и NestJS modules для queue, agent, Sheets, persistence и metrics; scheduler активировать только конфигурацией
- [x] 17.4 Прогнать тесты из 17.1 до green, `npm run typecheck` и module compilation tests без регрессий

## 18. Логи и метрики (TDD)

- [x] 18.1 Написать тесты observability: structured fields `group_id/run_id/phase/tool/source/record/duration/outcome/error_code` и метрики scans, changed sources, runs, duration, tool calls с согласованными labels
- [x] 18.2 Запустить тесты из 18.1 и зафиксировать ожидаемый red: programs ETL metrics/log instrumentation отсутствует
- [x] 18.3 Реализовать `PrometheusProgramsSyncMetrics` и структурное логирование фаз/tools без содержимого ячеек, полного prompt и полных catalog records
- [x] 18.4 Прогнать тесты из 18.1 до green и проверить `/metrics` на наличие новых series без высококардинальных `group_id/run_id` labels

## 19. Интеграционный групповой поток (TDD)

- [x] 19.1 До финального wiring написать integration/e2e-тест минимальной `ready`-группы: hourly scan → одна group job → mock agent tools/plan → create/update каталога → source links → successful fingerprint/run; отдельные сценарии failed agent и BullMQ retry
- [x] 19.2 Запустить тесты из 19.1 и зафиксировать ожидаемый red из-за отсутствующих интеграционных bindings/fixtures, а не ошибки самого теста
- [x] 19.3 Добавить недостающие test containers/fixtures и исправить интеграционные разрывы между BullMQ, PostgreSQL, Sheets mock и module composition
- [x] 19.4 Прогнать тесты из 19.1 до green и весь `npm test`, подтвердив отсутствие регрессий audit-agent и shared modules

## 20. API и queue contract

- [x] 20.1 Сверить реализованные DTO `scan-sources` и `sync-group` с API Contract: обязательные `runId/groupId/changedSources`, optional `previousRunId`, idempotent jobId, retry policy и отсутствие публичных HTTP endpoints; добавить недостающие contract assertions
- [x] 20.2 Прогнать contract/e2e-тесты, исправить найденные расхождения queue DTO/adapter bindings и зафиксировать соответствие payloads, error codes и observability fields architecture.md

## 21. Архитектурные диаграммы

- [ ] 21.1 Создать в Miro три согласованных фрейма: Domain Entity Interaction, External Modules Interaction и Processor to Completion; TDD не применяется, потому что это документационные артефакты без исполняемой логики
- [ ] 21.2 Заменить три `PENDING` в architecture.md прямыми Miro-ссылками, отметить diagram checklist и проверить, что схемы соответствуют фактической реализации

## 22. Финальные проверки

- [ ] 22.1 Выбрать одну `ready`-группу для тестового окружения, временно включить scheduler и подтвердить по run history/logs/metrics успешный проход без запуска групп других статусов
- [x] 22.2 Выполнить `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test` и `npm run build` в `backend`, исправить ошибки и сохранить результаты проверки
- [x] 22.3 Проверить миграции на чистой и уже обновлённой PostgreSQL, а также rollback-процедуру через отключение scheduler/worker без удаления таблиц и записанных данных
- [x] 22.4 Сверить реализацию с proposal, всеми тремя specs, design и architecture; отдельно подтвердить отсутствие deterministic sheet parser, secret filtering, проверок полноты/точных значений, group-wide transaction и unsupported schema substitutions

## 23. Code review

- [x] 23.1 Запустить code-review (скилл `code-review`) по всем изменениям фичи — от коммита, с которого начат change, до текущего HEAD: соответствие стандартам проекта и specs этого change
- [x] 23.2 Исправить замечания ревью (блокирующие и существенные обязательно; остальные — исправить или явно отклонить с обоснованием), результат зафиксировать коммитом
- [x] 23.3 Повторить code-review по правкам из 23.2 и убедиться, что блокирующих замечаний нет; прогнать тесты и зафиксировать, что они зелёные
