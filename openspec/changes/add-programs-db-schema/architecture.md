# Architecture: add-programs-db-schema

## Scope

Change добавляет только слой хранения в Postgres (миграции `004`–`007`) для каталога образовательных программ, справочников менеджера, индекса содержимого и трассировки источников. Прикладного кода (сервисы, репозитории, контроллеры) и HTTP API здесь нет: их создают `add-programs-etl-pipeline` и `add-programs-selection-agent` поверх контракта, описанного ниже.

---

## Backend — Domain Model

Таблицы описаны как сущности и границы агрегатов, чтобы следующие change опирались на единые названия. Классы появятся в них же; в этом change создаются только таблицы.

### Entities
| Name | Status | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| Organization (`organization`) | new | Да | `id`, `kind`, `name`, `parent_id` | Университет, колледж, филиал, академия, партнёр, школа |
| Location (`location`) | new | Нет | `organization_id`, `city`, `metro`, `address` | Площадка обучения |
| Faculty (`faculty`) | new | Нет | `organization_id`, `name` | Факультет организации |
| Program (`program`) | new | Да | `id`, `organization_id`, `faculty_id`, `level`, `title`, `direction_code`, `profile`, `qualification`, `is_state_funded`, `is_accredited`, `status`, `crm_name`, `source_row_id` | Образовательная программа с естественным ключом |
| Offer (`offer`) | new | Нет | `program_id`, `location_id`, `study_form`, `base_education`, `tariff`, `schedule`, `duration_months`, `hours`, `start_date`, `enroll_until`, `valid_to` | Сочетание формы, базы, площадки и тарифа |
| Price (`price`) | new | Нет | `offer_id`, `kind`, `amount`, `currency`, `condition` | Цена предложения по виду |
| EntranceRequirement (`entrance_requirement`) | new | Нет | `program_id`, `base_education`, `subject`, `min_score`, `is_required` | Вступительное испытание |
| Person (`person`) | new | Да | `id`, `full_name`, `bio`, `role` | Преподаватель, мастер, держатель программы |
| ProgramPerson (`program_person`) | new | Нет | `program_id`, `person_id`, `role` | Привязка человека к программе |
| ProgramMaterial (`program_material`) | new | Нет | `program_id`, `type`, `url`, `is_internal_only` | УП, презентация, бриф, промо-урок |
| ProgramBonus (`program_bonus`) | new | Нет | `program_id`, `bonus_program_id` | Курс в подарок |
| DiscountPolicy (`discount_policy`) | new | Да | `category`, `percent`, `period`, `documents`, `applied_by`, `is_internal_only` | Регламент скидок |
| RegionalRate (`regional_rate`) | new | Да | `region`, `federal_district`, `level`, `mode`, `price` | Региональная ставка |
| PaymentMethod (`payment_method`) | new | Да | `partner`, `terms`, `rate`, `how_to` | Способ оплаты или кредитования |
| ProductGroup (`product_group`) | new | Да | `name`, `applies_to`, `description` | Группа продуктов CRM |
| ContentChunk (`content_chunk`) | new | Нет | `program_id`, `organization_id`, `level`, `section_type`, `text`, `content_hash`, `embedding`, `source_row_id` | Фрагмент текста для поиска |
| SourceSheet (`source_sheet`) | new | Да | `spreadsheet_id`, `sheet_id`, `title`, `content_hash`, `synced_at`, `is_enabled` | Лист-источник |
| RawRow (`raw_row`) | new | Нет | `source_sheet_id`, `row_no`, `data`, `row_hash` | Сырая строка листа |

Все таблицы имеют `id UUID DEFAULT gen_random_uuid()`, `created_at`, `updated_at` (кроме связующих `program_person`, `program_bonus`, где ключ составной).

### Aggregates
| Aggregate | Root entity | Входит в состав | Инварианты, которые защищает |
|---|---|---|---|
| Organization | Organization | Location, Faculty | Уникальность `(kind, name)`; запрет удаления организации с программами |
| Program | Program | Offer, Price, EntranceRequirement, ProgramPerson, ProgramMaterial, ProgramBonus, ContentChunk | Естественный ключ программы (два частичных уникальных индекса); уникальность предложения и цены; неотрицательная сумма; каскадное удаление всего состава; согласованность `organization_id` и `level` в чанках |
| Person | Person | нет | Запись человека переживает удаление программы |
| SourceSheet | SourceSheet | RawRow | Уникальность `(spreadsheet_id, sheet_id)` и `(source_sheet_id, row_no)` |
| Reference data | DiscountPolicy, RegionalRate, PaymentMethod, ProductGroup | нет | Диапазон скидки 0–100; уникальность `(region, level, mode)` |

Ссылка Program → RawRow (`source_row_id`) нестрогая (`ON DELETE SET NULL`): очистка сырых строк не удаляет бизнес-данные.

### Value Objects
В этом change классов нет. Закладываю понятия, которые должны появиться в коде следующих change; они уже зафиксированы ограничениями схемы.

| Name | Поля | Почему VO |
|---|---|---|
| ProgramNaturalKey | `organizationId`, `level`, `directionCode?`, `profile?`, `qualification?`, `title` | Идентифицирует программу без суррогатного id; сравнение по значению |
| Money | `amount`, `currency` (`RUB`, `USD`, `EUR`) | Сумма неотрицательна, валюта обязательна; суммы разных валют не складываются |
| ProgramLevel, StudyForm, BaseEducation, PriceKind, SectionType | union-тип литералов | Допустимые значения заданы `CHECK` (см. design D1) |
| EmbeddingVector | `values` длиной 1536 | Размерность проверяется при создании |

### Services
| Service | Слой | Ответственность |
|---|---|---|
| Мигратор БД (`src/database/postgres/migrator.ts`) | infrastructure, existing | Применяет файлы `004`–`007` по порядку, один раз, под advisory lock, каждый в транзакции. Не меняется |
| Триггерная функция сброса вектора (в БД) | database | При изменении `content_chunk.text` обнуляет `embedding`; `content_hash` вычисляется автоматически |

Сервисов приложения в этом change нет.

### Method Signatures (ключевые, по каждому сервису)
| Service.Method | Params | Returns | Краткое описание |
|---|---|---|---|
| migrate | `connectionString: string`, `dir?: string` | `Promise<void>` | Существующая функция мигратора; применяет все ещё не применённые миграции |
| reset_embedding_on_text_change (триггер) | `OLD`, `NEW` строки `content_chunk` | `NEW` | Если `NEW.text` отличается от `OLD.text`, выставляет `NEW.embedding = NULL` |

---

## API Contract

HTTP-эндпоинтов, DTO и ошибок API в этом change нет. Фронтового этапа для него не предполагается.

Вместо этого фиксируется **контракт доступа к данным**, на который будут опираться следующие change:

| Сценарий | Потребитель | Контракт |
|---|---|---|
| Upsert программы | ETL | `INSERT ... ON CONFLICT` с указанием условия частичного индекса: с кодом направления — по `(organization_id, level, direction_code, profile, qualification)`, без кода — по `(organization_id, level, title)` |
| Upsert предложения и цены | ETL | Конфликт по `(program_id, location_id, study_form, base_education, tariff)` и `(offer_id, kind, condition)` |
| Удаление отсутствующих | ETL | `DELETE FROM program WHERE ...` — каскад очищает всё подчинённое |
| Запись чанка | ETL | Запись текста; `content_hash` вычисляется БД; вектор записывается отдельным шагом только для строк с `embedding IS NULL` |
| Векторный поиск | Агент | `ORDER BY embedding <=> $query LIMIT n` по `content_chunk WHERE embedding IS NOT NULL` с фильтрами по `organization_id`, `level`, `section_type`, `program_id` |
| Полнотекстовый поиск | Агент | Запрос к сохраняемому `tsvector` в `program` и `content_chunk`; код направления ищется точным совпадением или по префиксу |
| Ошибки БД | ETL, Агент | Нарушения `CHECK`, уникальности и ссылочной целостности возвращаются как ошибки Postgres; коды (`23505`, `23503`, `23514`) обрабатываются в следующих change |

---

## Diagrams

Не требуются: change содержит только миграции БД, рантайм-взаимодействия и слоёв запроса нет.

---

## Confirmation Checklist
- [x] Названия entity/aggregate/VO согласованы
- [x] Названия и сигнатуры ключевых методов сервисов согласованы
- [x] API Contract (эндпоинты, DTO, ошибки) согласован
- [x] Диаграммы не требуются (согласовано с пользователем)
- [x] Пользователь подтвердил переход к tasks.md
