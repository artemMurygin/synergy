# Architecture: add-programs-etl-pipeline

## Scope

Модуль `backend/src/modules/programs-etl/` синхронизирует семь Google-таблиц с существующим каталогом программ, справочниками и поисковым индексом Postgres. Единица атомарной записи — один лист; расчёт эмбеддингов выполняется после коммита отдельно от синхронизации каталога.

---

## Backend — Domain Model

### Entities

| Name | Status (new/existing) | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| SourceSheet (`source_sheet`) | existing | Да | `id`, `spreadsheet_id`, `sheet_id`, `title`, `content_hash`, `synced_at`, `is_enabled` | Идентичность листа, его настройка и результат последней успешной синхронизации |
| RawRow (`raw_row`) | existing | Нет | `id`, `source_sheet_id`, `row_no`, `data`, `row_hash` | Очищенная от секретов исходная строка для трассировки |
| SheetMapping (`sheet_mapping`) | new | Да | `source_sheet_id`, `header_hash`, `mapping JSONB`, `model`, `prompt_version`, `is_manually_edited`, `status` | Кэш проверенной карты структуры листа; `status` различает поддержанный и неподдержанный лист |
| Program (`program`) | existing | Да | `id`, естественный ключ, `source_row_id` | Нормализованная образовательная программа |
| Offer, Price, EntranceRequirement | existing | Нет | Ключи и поля существующего каталога | Условия обучения, цены и вступительные требования программы |
| ContentChunk (`content_chunk`) | existing | Нет | `program_id`, `section_type`, `chunk_no`, `text`, `embedding`, `source_row_id` | Текстовый фрагмент программы для полнотекстового и векторного поиска |
| DiscountPolicy, RegionalRate, PaymentMethod, ProductGroup | existing | Да | Естественные ключи соответствующих таблиц | Справочники, извлечённые из листов |

`Location` и `Faculty` — существующие сущности каталога, которые ETL находит или создаёт при разборе строк-заголовков. `Person`, `ProgramPerson`, `ProgramMaterial` и `ProgramBonus` остаются существующими таблицами; запись в них зависит от распознанных колонок конкретного листа.

### Aggregates

| Aggregate | Root entity | Входит в состав (entities/VO) | Инварианты, которые защищает |
|---|---|---|---|
| SourceSheet | SourceSheet | RawRow, SheetIdentity, RowHash | Уникальность `(spreadsheet_id, sheet_id)` и номера строки; новый хэш и `synced_at` записываются только при успешной транзакции листа |
| SheetMapping | SheetMapping | SheetMap, HeaderHash | Карта относится к конкретному листу, хэшу шапки, модели и версии промпта; ручная правка не затирается при неизменной шапке |
| Program | Program | Offer, Price, EntranceRequirement, ContentChunk, ProgramNaturalKey | Upsert по естественному ключу; зависимые записи соответствуют текущей выгрузке; текст чанка и его вектор не расходятся |
| Reference records | DiscountPolicy, RegionalRate, PaymentMethod, ProductGroup | Проверенные значения справочников | Upsert по ключам таблиц, допустимые диапазоны и перечисления |

Транзакция **синхронизации листа пересекает несколько агрегатов**: она атомарно заменяет строки источника, обновляет каталог и помечает лист синхронизированным. Это требование к согласованности импорта, а не расширение границы одного доменного агрегата. Postgres транзакция принадлежит `ProgramsWriterPort`.

### Value Objects

| Name | Поля | Почему VO (immutable/self-validating) |
|---|---|---|
| SheetIdentity | `spreadsheetId: string`, `sheetId: number` | Стабильный составной ключ листа |
| SanitizedSheet | Метаданные, объединённые ячейки, строки `{ rowNo, cells }[]` | После создания не содержит секретных колонок и значений; только его можно передавать парсеру и записи `raw_row` |
| SheetMap | Тип листа, роли колонок, контекст заголовков, правила формы/базы/даты, заметки | Проверяется по фактическим колонкам и допустимым значениям до применения |
| ParsedSheet | Нормализованные программы, предложения, цены, справочники, текстовые разделы, предупреждения | Результат чистого разбора; без частично записанных данных |
| ProgramNaturalKey | `organizationId`, `level`, `directionCode?`, `profile?`, `qualification?`, `title` | Совпадает с двумя частичными уникальными индексами `program` |
| PriceCell | `amounts`, `durationMonths?`, `currency`, `sourceText` | Суммы и срок детерминированно извлекаются из исходной ячейки и проверяются |
| ChunkDraft | `programKey`, `sectionType`, `chunkNo`, `text`, `sourceRowNo` | Один законченный фрагмент; идентичность по программе, разделу и номеру |

### Services

| Service | Слой (application/domain/infrastructure) | Ответственность |
|---|---|---|
| PlanSync | application | Получить метаданные семи таблиц, зарегистрировать новые листы, отобрать доступные и поставить `sync-sheet` задачи; поставить `embed-pending` для восстановления незавершённых расчётов прошлых запусков |
| SyncSheet | application | Прочитать и очистить лист, пропустить неизменённый, получить карту, разобрать строки, извлечь справочники из прозы, проверить полноту и атомарно записать результат |
| EmbedPendingChunks | application | Пакетами получить векторы для `embedding IS NULL` и сохранить только векторы ожидаемой размерности |
| SecretFilter | domain | Удалить секретные колонки и значения до парсинга, хранения и логирования |
| SheetParser | domain | Детерминированно применить проверенную карту к строкам; разобрать предложения, цены, коды, справочники и текстовые разделы |
| EmptyExportGuard | domain | Отклонить подозрительную выгрузку или чрезмерную потерю распознанных строк |
| ChunkBuilder | domain | Нарезать разделы на абзацы заданной длины и собрать карточку программы |
| SheetsReaderPort / GoogleSheetsReader | application / infrastructure | Метаданные, значения и объединённые ячейки через Sheets API с сервисным аккаунтом |
| SheetMapperPort / OpenAiSheetMapper | application / infrastructure | Построить структурированную карту по шапке и образцам при отсутствии кэша |
| ReferenceTextExtractorPort / OpenAiReferenceTextExtractor | application / infrastructure | Извлечь скидки, ставки, способы оплаты и группы из свободного текста справочников по схеме записи; проверять точные суммы и проценты по исходному блоку |
| SheetMappingRepositoryPort / PgSheetMappingRepository | application / infrastructure | Читать и сохранять проверенную карту, учитывать ручную правку |
| ProgramsWriterPort / PgProgramsWriter | application / infrastructure | Реестр листов, транзакционная замена `raw_row`, upsert/удаление каталога и запись чанков |
| EmbeddingsPort / OpenAiEmbeddingsAdapter | application / infrastructure | Рассчитать эмбеддинги текста пакетами |
| SyncAlertPort / SyncMetricsAlert | application / infrastructure | Метрики и структурные ошибки без содержимого ячеек |
| ProgramsSyncScheduler / ProgramsEtlProcessor | interface | Повторяющийся BullMQ job, выполнение `plan`, `sync-sheet`, `embed-pending`, повторы и дедупликация |

Порты объявлены в `application`, адаптеры — в `infrastructure`; `domain` не зависит от Nest, Slonik, Google или OpenAI. Процессор очереди — входной адаптер. Прикладные репозитории используют `PG_POOL`, экспортируемый существующим `PostgresModule` как `DatabasePool` Slonik; `pg` остаётся только у мигратора. ORM нет.

### Method Signatures (ключевые, по каждому сервису)

| Service.Method | Params | Returns | Краткое описание |
|---|---|---|---|
| `PlanSync.execute` | `(): Promise<PlanSyncResult>` | Число поставленных и пропущенных листов | Читает список spreadsheet ID, обновляет реестр, отбирает листы, ставит задачи и инициирует досчёт оставшихся эмбеддингов |
| `SyncSheet.execute` | `(identity: SheetIdentity): Promise<SyncSheetResult>` | `synced \| unchanged \| skipped` и счётчики | Одна атомарная синхронизация листа; для прозы использует извлекатель справочников, после коммита ставит расчёт эмбеддингов |
| `EmbedPendingChunks.execute` | `(batchSize: number): Promise<EmbedResult>` | Число обновлённых и ошибочных фрагментов | Обрабатывает фрагменты без вектора, проверяет размерность `1536` |
| `SecretFilter.sanitize` | `(sheet: ReadSheet): SanitizationResult` | `SanitizedSheet`, счётчики исключений | Удаляет запрещённые колонки и ячейки на границе чтения |
| `SheetParser.parse` | `(sheet: SanitizedSheet, map: SheetMap): ParsedSheet` | Нормализованные записи и предупреждения | Чистый разбор строк по карте; цена и срок не извлекаются LLM |
| `EmptyExportGuard.assertSafe` | `(previousRowCount: number, currentRecognizedRowCount: number, threshold: number): void` | Ошибка при нарушении порога | Останавливает запись до транзакции |
| `ChunkBuilder.build` | `(program: ParsedProgram): ChunkDraft[]` | Фрагменты программы | Дословные разделы плюс карточка; длинный текст делится по абзацам |
| `SheetsReaderPort.listSheets` | `(spreadsheetId: string): Promise<SheetMetadata[]>` | Метаданные листов | Включая `hidden`, стабильный `sheetId`, `merges` |
| `SheetsReaderPort.readSheet` | `(identity: SheetIdentity): Promise<ReadSheet>` | Форматированные значения | Читает один лист |
| `SheetMapperPort.map` | `(sheet: SanitizedSheet, model: string, promptVersion: string): Promise<SheetMap>` | Карта структуры | Вызывается только при отсутствии подходящего кэша |
| `ReferenceTextExtractorPort.extract` | `(blocks: SanitizedReferenceBlock[]): Promise<ParsedReferenceRecords>` | Проверенные справочники | Результат кэшируется по хэшу блока; суммы и проценты подтверждаются исходным текстом |
| `SheetMappingRepositoryPort.find` | `(identity: SheetIdentity, headerHash: string, model: string, promptVersion: string): Promise<SheetMapping \| null>` | Кэш или `null` | Сохраняет ручную карту до смены шапки |
| `SheetMappingRepositoryPort.save` | `(mapping: SheetMapping): Promise<void>` | — | Записывает прошедшую проверку карту или статус «не поддержан» |
| `ProgramsWriterPort.listRegisteredSheets` | `(): Promise<SourceSheet[]>` | Реестр листов | Для планирования и ручного `is_enabled` |
| `ProgramsWriterPort.registerSheets` | `(sheets: SheetMetadata[]): Promise<void>` | — | Upsert метаданных без сброса `is_enabled` |
| `ProgramsWriterPort.getSyncState` | `(identity: SheetIdentity): Promise<SheetSyncState>` | Хэш, время, число строк | Решение о пропуске и проверка порога |
| `ProgramsWriterPort.replaceSheet` | `(identity: SheetIdentity, sheet: SanitizedSheet, parsed: ParsedSheet, hash: string): Promise<SyncWriteResult>` | Записанные счётчики | Одна транзакция: зафиксировать старую принадлежность листу → заменить `raw_row` → upsert → удалить отсутствующее → обновить `source_sheet` |
| `ProgramsWriterPort.listPendingChunks` | `(limit: number): Promise<PendingChunk[]>` | Чанки с `embedding IS NULL` | Брать только незавершённые фрагменты |
| `ProgramsWriterPort.saveEmbeddings` | `(items: EmbeddedChunk[]): Promise<number>` | Число сохранённых | Обновлять лишь при совпадении `id` и ожидаемого `content_hash`, чтобы не записать устаревший вектор после изменения текста |
| `EmbeddingsPort.embed` | `(texts: string[]): Promise<number[][]>` | Векторы в порядке входа | Проверка размерности до записи |
| `SyncAlertPort.record` | `(event: SyncEvent): void` | — | Логи и метрики по результатам, предупреждениям, исключениям |
| `ProgramsSyncScheduler.register` | `(): Promise<void>` | — | Один планировщик с постоянным ID и интервалом из env |
| `ProgramsEtlProcessor.process` | `(job: PlanJob \| SyncSheetJob \| EmbedPendingJob): Promise<void>` | — | Передаёт задачу use-case; для неисправимых ошибок отменяет повторы |

Карточка программы использует существующий `section_type = 'about'` и `chunk_no = 0`; обычные фрагменты «О программе» нумеруются с 1. Это позволяет создать карточку без расширения `CHECK` существующей таблицы `content_chunk`.

---

## API Contract

HTTP-эндпоинтов и публичных DTO в этом change **нет**: ручной запуск и UI исключены из scope. Фронтенд не обращается к модулю ETL. Его входной контракт — внутренние задачи BullMQ:

| Method | Path | Request (DTO / query) | Response (DTO) | Ошибки (status + код) |
|---|---|---|---|---|
| BullMQ job `plan` | очередь `programs-etl` | `{}`; повторяющийся job с фиксированным scheduler ID | Завершение job; метрики `queued`, `skipped` | HTTP status неприменим; `CONFIG_MISSING`, `SHEETS_UNAVAILABLE` → ошибка job и ограниченный retry |
| BullMQ job `sync-sheet` | очередь `programs-etl` | `{ spreadsheetId: string, sheetId: number }`; job ID `sync:<spreadsheetId>:<sheetId>` | Завершение job; метрики `synced`, `unchanged`, `skipped` | HTTP status неприменим; `UNSUPPORTED_SHEET`, `INVALID_SHEET_MAP`, `SUSPICIOUS_EXPORT` → без retry; `SHEETS_UNAVAILABLE`, `DB_UNAVAILABLE`, `MAPPING_PROVIDER_UNAVAILABLE` → retry |
| BullMQ job `embed-pending` | очередь `programs-etl` | `{}`; ставится после успешного коммита листа | Завершение job; число рассчитанных векторов в метрике | HTTP status неприменим; `EMBEDDING_PROVIDER_UNAVAILABLE`, `DB_UNAVAILABLE` → retry; `EMBEDDING_DIMENSION_MISMATCH` → ошибка конфигурации без записи некорректного вектора |

Неизвестный или скрытый лист, лист с «копия» в названии и `is_enabled = false` пропускаются без изменения данных. Парсинг и запись выполняются только для поддержанного листа с прошедшей проверку картой. Тело ошибки не содержит исходных ячеек.

---

## Diagrams

Диаграммы пропущены по прямому запросу пользователя. Связи сущностей и границы вызовов описаны в таблицах выше.

---

## Confirmation Checklist

- [x] Названия entity/aggregate/VO согласованы (пользователь поручил перейти к `tasks.md`)
- [x] Названия и сигнатуры ключевых методов сервисов согласованы (пользователь поручил перейти к `tasks.md`)
- [x] API Contract (внутренние BullMQ jobs, DTO, ошибки; HTTP-эндпоинтов нет) согласован (пользователь поручил перейти к `tasks.md`)
- [x] Диаграммы пропущены по запросу пользователя
- [x] Пользователь подтвердил переход к `tasks.md`
