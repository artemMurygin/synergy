# Architecture: agentic-programs-etl

## Scope

Изменение создаёт backend-модуль `programs-etl`, который каждый час обнаруживает изменившиеся Google Sheets, объединяет их по группам из `price-policy-rag/tabels-links/groups.json`, запускает серверного агента и применяет его mutation plan к существующему каталогу программ.

Существующие таблицы каталога, `source_sheet`, `raw_row`, `sheet_mapping` и миграции `004`–`008` сохраняются. Добавляются история групповых запусков и типизированные связи записей каталога с исходными строками. Frontend и публичный HTTP API в этот change не входят.

---

## Backend — Domain Model

### Entities

| Name | Status | Aggregate root? | Ключевые поля | Назначение |
|---|---|---:|---|---|
| `Organization` | existing | да | `id`, `kind`, `name`, `parentId?` | Организация, которой принадлежит каталог программ |
| `Faculty` | existing | нет | `id`, `organizationId`, `name` | Факультет программы |
| `Location` | existing | нет | `id`, `organizationId`, `city`, `metro?`, `address?` | Площадка реализации предложения |
| `Program` | existing | да | `id`, `organizationId`, `level`, `title`, атрибуты каталога | Корневая запись программы; доменная идентичность задаётся `id` |
| `Offer` | existing | нет | `id`, `programId`, параметры набора | Предложение, принадлежащее программе |
| `Price` | existing | нет | `id`, `offerId`, стоимостные поля | Цена предложения |
| `EntranceRequirement` | existing | нет | `id`, `programId`, условия поступления | Условия поступления программы |

`ProgramsSyncRun`, `SourceSheet`, `RawRow`, `ContentChunk` и `CatalogSourceLink` не являются доменными сущностями. Это соответственно состояние application workflow и технические persistence-модели синхронизации, staging, RAG-индекса и provenance.

### Aggregates

| Aggregate | Root entity | Входит в состав | Инварианты |
|---|---|---|---|
| `Organization` | `Organization` | ссылки на `Faculty` и `Location` по ID | Организация определяется уникальной парой `kind + name`; дочерняя организация ссылается на родительскую по ID |
| `Program` | `Program` | `Offer[]`, `Price[]`, `EntranceRequirement[]` | Предложение уникально по программе, площадке, форме, базовому образованию и тарифу; цена неотрицательна |

Транзакция на всю ETL-группу не является инвариантом. `ProgramsGroup` — application-конфигурация из `groups.json`, а не сохраняемый domain aggregate.

### Value Objects

| Name | Поля | Почему VO |
|---|---|---|
| `ProgramLevel` | закрытый набор уровней существующей схемы | Не допускает неподдерживаемый уровень программы |
| `ProgramStatus` | `active`, `enrollment_closed`, `new` | Закрытый набор состояний набора |
| `StudyForm` | закрытый набор форм обучения существующей схемы | Неизменяемый классификатор предложения |
| `BaseEducation` | `grade9`, `grade11`, `spo`, `vo`, `any` | Неизменяемая база поступления |
| `Money` | `amount`, `currency` | Сумма неотрицательна, валюта из поддерживаемого набора |
| `PriceKind` | закрытый набор видов цены | Определяет смысл цены без инфраструктурных деталей |

### Application Workflow Models

Это типизированные контракты use cases, но не domain entities, aggregates или domain VO.

| Name | Ключевые поля | Назначение |
|---|---|---|
| `ProgramsSyncRunRecord` | `id`, `groupId`, `previousRunId?`, `trigger`, `status`, `changedSources[]`, timestamps, `failure?` | Состояние одной попытки выполнения use case и данные для retry/observability |
| `ProgramsGroup` | `id`, `name`, `status`, `note?`, `sources[]` | Снимок задания из `groups.json` |
| `GroupSource` | `sourceId`, `book`, `spreadsheetId`, `sheetId`, `title`, `role?`, `url` | Разрешённый агенту источник текущей группы |
| `SourceFingerprint` | `value` | Hash наблюдаемого или последнего успешно обработанного содержимого |
| `ChangedSource` | `sourceId`, `observedHash` | Изменённая версия листа из scan-задачи |
| `SourceReference` | `sourceId`, `rowNumbers[]`, `ranges[]?` | Нейтральная ссылка на происхождение без `raw_row` и Google SDK-типов |
| `CatalogRecordRef` | `recordType`, `recordId` | Ссылка на запись, найденную catalog read tools в текущем запуске |
| `ProgramMatchKey` | `coded { organizationId, level, directionCode, profile?, qualification? }` или `titled { organizationId, level, title }` | Application-ключ поиска и идемпотентного create, повторяющий два уникальных индекса существующей БД; не является идентичностью domain entity |
| `CatalogMutation` | `kind: create/update`, `recordType`, `recordId?`, `data`, `sources[]` | Одна операция structured response агента |
| `CatalogMutationPlan` | `operations[]` | План применения результата агента application-слоем |
| `ProgramContentSection` | `programRef`, `sectionType`, `text`, `source` | Смысловая секция текста до инфраструктурного разбиения на `content_chunk` |
| `RunFailure` | `code`, `message`, `retryable` | Краткая техническая причина без содержимого листов и prompt |

### Infrastructure Persistence Models

| Model / table | Слой | Назначение |
|---|---|---|
| `source_sheet` | infrastructure | Хранит идентификаторы Google Sheet и hash последней успешно обработанной версии |
| `raw_row` | infrastructure | Staging-снимок исходной строки и её hash |
| `content_chunk` | infrastructure | RAG-разбиение `ProgramContentSection`, `embedding` и `search_vector` |
| typed catalog-source link tables | infrastructure | Реальные FK от записей каталога к `raw_row`, `group_id` и `last_seen_run_id` |
| programs sync run table | infrastructure | Сохраняет `ProgramsSyncRunRecord` для retry и наблюдаемости |

### Domain Rules

- Предложение уникально по программе, площадке, форме обучения, базовому образованию и тарифу.
- Цена не может быть отрицательной; для вида `discounted` обязательно условие применения.
- Вступительное требование уникально по программе, базовому образованию и предмету; минимальный балл неотрицателен.

### Application Workflow Rules

- В первой версии запускаются только группы `ready`. `needs_matching`, `out_of_scope_schema` и `deferred` не ставятся в очередь; отдельного ручного входа для них этот change не добавляет.
- `ProgramsSyncRunRecord` проходит application-переходы `queued → running → succeeded | failed`; завершённая попытка не переоткрывается, а явный retry создаёт новую запись с `previousRunId`.
- Для поиска и идемпотентного `create` writer использует `ProgramMatchKey`: вариант `coded` при наличии `directionCode`, иначе вариант `titled`. Это правило сопоставления ETL и существующей схемы БД, а не доменная идентичность `Program`.
- Один scan формирует не более одной `sync-group` job на затронутую группу и объединяет в ней все изменённые листы группы.
- Агент может читать любой источник назначенной группы, включая неизменившиеся листы, но не может выйти за её границы.
- Агент имеет только read-only инструменты Sheets и каталога. SQL и инструменты записи модели не выдаются.
- Mutation plan первой версии содержит только `create` и `update`. Удаление или архивирование отсутствующей записи не выводится из факта, что её нет в прочитанных данных.
- `recordId` для `update` должен быть получен агентом через catalog read tools в рамках текущего запуска.
- Ошибка агента или записи не продвигает сохранённый successful fingerprint; следующий hourly scan снова обнаружит изменение.

---

## Backend — Layers and Dependencies

| Слой | Компоненты | Разрешённые зависимости |
|---|---|---|
| `domain` | entities, aggregates, value objects, domain errors | Только TypeScript standard library |
| `application` | use cases, commands/results, порты внешних систем | `domain`; не импортирует NestJS, BullMQ, LangChain, Google API и SQL-клиент |
| `infrastructure` | Deep Agents, Google Sheets, Postgres, BullMQ, Prometheus adapters | `application` ports и внешние SDK |
| `interface` | BullMQ processors и scheduler bootstrap | application use cases и transport DTO очереди |

NestJS-модуль является composition root и связывает порты с адаптерами через явные DI-токены. SDK-типы завершаются внутри infrastructure adapters.

### Application Services

| Service | Ответственность |
|---|---|
| `ScanProgramSourcesUseCase` | Загружает группы `ready`, пакетно читает наблюдаемые листы, сравнивает hashes и передаёт каждую изменившуюся группу scheduling service |
| `ScheduleProgramsGroupSyncService` | Внутренний application-сервис: создаёт run и ставит одну `sync-group` job; централизует этот шаг для hourly scan и retry |
| `SyncProgramsGroupUseCase` | Загружает группу и run, запускает агента, применяет mutation plan, обновляет source links и только после успеха продвигает fingerprints |
| `RetryProgramsSyncUseCase` | Проверяет завершившийся failed-run и передаёт scheduling service новый запуск с `previousRunId` |
| `ListProgramsSyncRunsQuery` | Возвращает историю запусков для операционной диагностики |
| `GetProgramsSyncRunQuery` | Возвращает один run с изменёнными источниками и краткой ошибкой |

### Ports and Adapters

| Application port | Infrastructure adapter | Назначение |
|---|---|---|
| `GroupRegistryPort` | `JsonGroupRegistry` | Чтение `groups.json` как снимка групповых заданий |
| `SheetsReaderPort` | `GoogleSheetsReader` | Пакетное чтение для scan и ограниченное A1-чтение для agent tools |
| `ProgramsAgentPort` | `DeepAgentsProgramsAgent` | `createDeepAgent`, `ChatOpenAI`, tools и structured response |
| `CatalogQueryPort` | `CatalogQueryRepository` | Read-only поиск текущих записей и связей с источниками |
| `CatalogWriterPort` | `CatalogWriterRepository` | Идемпотентное применение `create/update` к каталогу и source links |
| `SourceStateRepositoryPort` | `PostgresSourceStateRepository` | Чтение successful fingerprint и его продвижение после успеха; скрывает таблицу `source_sheet` |
| `SyncRunStorePort` | `PostgresSyncRunStore` | Сохранение `ProgramsSyncRunRecord`; скрывает таблицу истории запусков |
| `ProgramsSyncQueuePort` | `BullProgramsSyncQueue` | Постановка `scan-sources` и `sync-group`, retry/backoff |
| `ProgramsSyncMetricsPort` | `PrometheusProgramsSyncMetrics` | Счётчики и длительности scan, runs и agent tools |

### Method Signatures

| Service.Method | Params | Returns | Примечание |
|---|---|---|---|
| `ScanProgramSourcesUseCase.execute` | `now: Date` | `Promise<{ scannedSources: number; changedSources: number; enqueuedGroups: number }>` | Один hourly scan |
| `ScheduleProgramsGroupSyncService.schedule` | `{ groupId; changedSources; trigger: scheduled/retry; previousRunId? }` | `Promise<{ runId: string }>` | Создаёт `ProgramsSyncRunRecord` и ставит идемпотентную job |
| `SyncProgramsGroupUseCase.execute` | `command: SyncProgramsGroupCommand` | `Promise<ProgramsSyncResult>` | Полный групповой цикл; принимает `runId`, `groupId`, `changedSources` |
| `RetryProgramsSyncUseCase.execute` | `{ previousRunId: string }` | `Promise<{ runId: string }>` | Только для завершившегося failed-run |
| `ListProgramsSyncRunsQuery.execute` | `{ groupId?; status?; limit; cursor? }` | `Promise<CursorPage<ProgramsSyncRunSummary>>` | Внутренний read model |
| `GetProgramsSyncRunQuery.execute` | `{ runId: string }` | `Promise<ProgramsSyncRunDetails | null>` | Внутренний read model |
| `GroupRegistryPort.listScheduledGroups` | `—` | `Promise<ProgramsGroup[]>` | Возвращает только группы `ready` для hourly scan |
| `GroupRegistryPort.getGroup` | `groupId: GroupId` | `Promise<ProgramsGroup | null>` | Возвращает снимок одной группы |
| `SheetsReaderPort.readFingerprints` | `sources: GroupSource[]` | `Promise<Map<string, SourceFingerprint>>` | Batch-read для scan |
| `SheetsReaderPort.readRange` | `{ source: GroupSource; range: BoundedA1Range }` | `Promise<SheetRangeResult>` | Основа `read_sheet_range` |
| `ProgramsAgentPort.buildMutationPlan` | `{ runId; group; changedSources }` | `Promise<CatalogMutationPlan>` | Agent adapter сам создаёт tools, замкнутые на run/group |
| `CatalogQueryPort.searchRecords` | `CatalogSearchQuery` | `Promise<CatalogRecordSummary[]>` | Основа `search_catalog_records` |
| `CatalogQueryPort.getRecord` | `CatalogRecordRef` | `Promise<CatalogRecordDetails | null>` | Основа `get_catalog_record` |
| `CatalogQueryPort.listSourceRecords` | `SourceRecordQuery` | `Promise<CatalogRecordSummary[]>` | Поиск прежнего ID по источнику/строке |
| `CatalogWriterPort.applyPlan` | `{ runId; groupId; plan }` | `Promise<{ created: number; updated: number }>` | Применяет операции репозитория; не является group-wide transaction |
| `SourceStateRepositoryPort.findSuccessfulFingerprints` | `sourceIds: string[]` | `Promise<Map<string, SourceFingerprint | null>>` | `null` означает ещё не обработанный источник |
| `SourceStateRepositoryPort.markSuccessfullyProcessed` | `{ runId; fingerprints: ChangedSource[] }` | `Promise<void>` | Вызывается после успешного `applyPlan` |
| `SyncRunStorePort.createQueued` | `NewProgramsSyncRun` | `Promise<ProgramsSyncRunRecord>` | Создаётся до enqueue |
| `SyncRunStorePort.markRunning` | `runId: string` | `Promise<void>` | Идемпотентный application transition из `queued` |
| `SyncRunStorePort.markSucceeded` | `runId: string` | `Promise<void>` | После записи каталога и fingerprints |
| `SyncRunStorePort.markFailed` | `{ runId; failure: RunFailure }` | `Promise<void>` | Не меняет fingerprints |
| `ProgramsSyncQueuePort.enqueueGroup` | `SyncGroupJob` | `Promise<void>` | `jobId = programs-etl:sync:<runId>` |

### Agent Tool Contract

| Tool | Input | Output | Ошибки |
|---|---|---|---|
| `list_group_sources` | `{}` | group metadata и `sources[]` | `GROUP_NOT_AVAILABLE` |
| `read_sheet_range` | `{ source_id, range }` | координаты источника, `rows[]`, `truncated`, `next_range?` | `SOURCE_NOT_IN_GROUP`, `INVALID_RANGE`, `SOURCE_UNAVAILABLE`, `RATE_LIMITED`, `TIMEOUT` |
| `search_catalog_records` | `{ record_type, criteria, limit? }` | небольшое множество кандидатов с IDs, естественными ключами и источниками | `INVALID_QUERY`, `CATALOG_UNAVAILABLE` |
| `get_catalog_record` | `{ record_type, record_id, section? }` | детальная текущая запись; полный текст секции только по явно указанному разделу | `RECORD_NOT_FOUND`, `CATALOG_UNAVAILABLE` |
| `list_source_records` | `{ source_id, row_no? }` | записи каталога, ранее связанные с источником или строкой | `SOURCE_NOT_IN_GROUP`, `CATALOG_UNAVAILABLE` |

Tools не принимают `groupId`, SQL, имя таблицы или произвольный фильтр: область доступа привязана к экземпляру tool при создании agent run.

---

## API Contract

Публичных HTTP-эндпоинтов change не добавляет. Hourly scan, групповая синхронизация и retry являются внутренними backend-входами. Frontend DTO и клиентская интеграция отсутствуют.

### Queue Contracts

| Queue / Job | Payload | Idempotency | Retry |
|---|---|---|---|
| `programs-etl-scan / scan-sources` | `{ scheduledAt: string }` | один scheduler tick; overlapping scan не запускается | ограниченные attempts с exponential backoff для временных ошибок Sheets/DB |
| `programs-etl-sync / sync-group` | `{ runId: string; groupId: string; changedSources: Array<{ sourceId: string; observedHash: string }>; previousRunId?: string }` | `jobId = programs-etl:sync:<runId>` | ограниченные attempts с exponential backoff; все attempts относятся к одному run |

Отдельного ручного запуска группы этот change не добавляет. Если позднее потребуется UI или CLI для запуска `needs_matching`, входной адаптер и его контракт проектируются отдельным change. Повтор failed-run остаётся внутренней операцией application-слоя; автоматические повторы одной job выполняет BullMQ.

### Errors

| Error | Retryable | Поведение |
|---|---:|---|
| `GROUP_NOT_FOUND` | нет | job завершается failed без повторного чтения |
| `GROUP_NOT_RUNNABLE` | нет | scheduling отклоняет группу со статусом, отличным от `ready` |
| `SOURCE_NOT_IN_GROUP` / `INVALID_RANGE` | нет | ошибка agent run и failed status |
| `SOURCE_UNAVAILABLE` / `RATE_LIMITED` / `TIMEOUT` | да | BullMQ retry; fingerprint не продвигается |
| `CATALOG_UNAVAILABLE` | да | BullMQ retry; mutation plan не считается применённым |
| `RECORD_NOT_FOUND` | зависит от контекста | агент повторяет поиск или формирует `create`; writer не угадывает новый ID |
| `AGENT_TIMEOUT` / `AGENT_PROVIDER_ERROR` | да | BullMQ retry в заданных пределах |
| `MUTATION_CONFLICT` | нет | run становится failed; автоматическое удаление/перезапись конфликтующей записи не выполняется |

### Observability Contract

- Structured logs: `group_id`, `run_id`, `phase`, `tool_name?`, `source_id?`, `record_type?`, `record_id?`, `duration_ms`, `outcome`, `error_code?`.
- Логи tools не содержат значения ячеек, полный prompt или полный catalog record.
- Метрики: `programs_etl_scans_total{outcome}`, `programs_etl_changed_sources_total`, `programs_etl_runs_total{status,trigger}`, `programs_etl_run_duration_seconds`, `programs_etl_tool_calls_total{tool,outcome}`.

---

## Diagrams

### 1. Domain Entity Interaction

Miro link: **PENDING — Miro MCP недоступен в текущей сессии.**

Требуемый фрейм: `agentic-programs-etl — Domain Entity Interaction`; flowchart должен показывать только каталог: `Organization`, `Faculty`, `Location`, aggregate `Program`, дочерние `Offer`, `Price`, `EntranceRequirement` и доменные VO. ETL run, Sheets, staging, provenance и RAG-чанки на эту диаграмму не входят.

### 2. External Modules Interaction

Miro link: **PENDING — Miro MCP недоступен в текущей сессии.**

Требуемый фрейм: `agentic-programs-etl — External Modules Interaction`; flowchart должен показать NestJS scheduler/processors, BullMQ/Redis, Google Sheets, Deep Agents/OpenAI, application use cases, Postgres catalog/run history и Prometheus.

### 3. Layer Interaction — Controller to Response

Miro link: **PENDING — Miro MCP недоступен в текущей сессии.**

Публичного controller в change нет. Требуемый фрейм переименовывается в `agentic-programs-etl — Processor to Completion` и как UML sequence показывает `SyncGroupProcessor → SyncProgramsGroupUseCase → GroupRegistryPort → ProgramsAgentPort/tools → CatalogWriterPort → SourceStateRepositoryPort → SyncRunStorePort → Processor`, включая failed-ветку без обновления fingerprint.

---

## Confirmation Checklist

- [x] Названия entity/aggregate/VO согласованы
- [x] Названия и сигнатуры ключевых методов сервисов согласованы
- [x] API Contract и queue DTO согласованы
- [ ] Три Miro-диаграммы созданы и отражают ожидаемую реализацию
- [x] Пользователь подтвердил переход к `tasks.md`

