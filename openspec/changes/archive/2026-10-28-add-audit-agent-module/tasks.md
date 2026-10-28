## 1. Подготовка и инфраструктура

- [x] 1.1 Добавить зависимость `langchain` v1 в `audit-agent/package.json` (версия согласована с `@langchain/core` 1.x); проверить: `npm install`, `npm run typecheck` и `npm run build` проходят. Тесты не нужны: правка зависимостей без логики
- [x] 1.2 Добавить в `.env.example` и в конфиг `src/shared/config`: `DEAL_SYNC_INTERVAL_MINUTES=60`, `DEAL_SYNC_DEFAULT_WINDOW_MINUTES=5`, `CRM_DRIVER=mock`, `TELEGRAM_BOT_TOKEN`, параметры ретраев очередей (`attempts`, `backoff`) для `deal-sync`, `audit`, `notification`; проверить: приложение стартует, невалидный конфиг даёт понятную ошибку. Тесты не нужны: декларативный конфиг без ветвлений, валидация проверяется стартом приложения
- [x] 1.3 Создать каркас модуля `src/modules/audit-agent/` со слоями `domain`, `application`, `infrastructure`, `interface` и подключить `AuditAgentModule` в `app.module.ts`; проверить: `npm run build` проходит, приложение стартует. Тесты не нужны: пустой каркас без логики
- [x] 1.4 Добавить SQL-миграцию `db/migrations/002_employee.sql` (таблица `employee`: `crm_responsible_id` UNIQUE, `telegram_username` UNIQUE, `telegram_chat_id`, `is_active`) и сид с несколькими сотрудниками для мока; проверить: мигратор применяет миграцию на чистой БД, повторный запуск ничего не ломает. Тесты не нужны: миграция без ветвлений
- [x] 1.5 Добавить SQL-миграцию `db/migrations/003_deal_audit.sql` (таблица `deal_audit`: `deal_id`, `deal_updated_at`, `verdict`, `issues JSONB`, `audited_at`, UNIQUE `(deal_id, deal_updated_at)`, индекс по `deal_id`); проверить: мигратор применяет миграцию, дубликат `(deal_id, deal_updated_at)` отклоняется. Тесты не нужны: миграция без ветвлений

## 2. Домен: сущности, value objects, ошибки

- [x] 2.1 Написать тесты на `DealId`, `RequiredField`, `AuditVerdict`, `AuditIssue`, `NotificationJob`, `SyncWindow` (валидация, неизменяемость, `from <= to`), на сущности `Deal`, `DealAudit` (инварианты: при `ok` проблем нет), `Employee` и убедиться, что тест-раннер их видит
- [x] 2.2 Прогнать тесты из 2.1 и зафиксировать, что они падают (red) из-за отсутствия реализации
- [x] 2.3 Реализовать сущности, value objects и доменные ошибки (`DealNotFoundError`, `TransientNotifyError`, `PermanentNotifyError`) в `domain/`
- [x] 2.4 Прогнать тесты из 2.1 и зафиксировать, что они зелёные (green), регрессий нет

## 3. Домен: порты

- [x] 3.1 Объявить порты в `domain/` с суффиксом `Port`: `CrmGatewayPort`, `DealAuditorPort`, `NotifierPort`, `EmployeeRepositoryPort`, `DealAuditRepositoryPort`, `SyncCursorRepositoryPort`, `AuditQueuePort`, `NotificationQueuePort` с сигнатурами из architecture.md; проверить: `npm run typecheck` проходит, в `domain/` нет импортов NestJS, BullMQ, LangChain, pg, Telegram. Тесты не нужны: только типы и абстрактные контракты без логики

## 4. CRM: мок-реализация (spec `crm-gateway`)

- [x] 4.1 Написать тесты на `MockCrmGateway`: фильтр `listUpdatedDealIds(since)`, пустой результат, `getDeal` с полной карточкой, `DealNotFoundError` для неизвестного id, наличие полных и неполных сделок в наборе; убедиться, что тест-раннер их видит
- [x] 4.2 Прогнать тесты из 4.1 и зафиксировать, что они падают (red) по ожидаемой причине
- [x] 4.3 Реализовать `MockCrmGateway` в `infrastructure/crm/` (около 10 сделок вуза: полные и с пропусками разных обязательных полей, несколько `responsibleId`, в том числе отсутствующий в справочнике) и выбор адаптера по `CRM_DRIVER`
- [x] 4.4 Прогнать тесты из 4.1 и зафиксировать, что они зелёные (green), регрессий нет

## 5. Хранилища: репозитории и курсор

- [x] 5.1 Написать тесты на `EmployeeRepository` (`findByResponsibleId`, `findByUsername`, только активные, `null` для неизвестного), `DealAuditRepository` (`findByVersion`, `save`, уникальность версии) и `SyncCursorRepository` (`get` пустой, `set`/`get`) и убедиться, что тест-раннер их видит
- [x] 5.2 Прогнать тесты из 5.1 и зафиксировать, что они падают (red) по ожидаемой причине
- [x] 5.3 Реализовать `EmployeeRepository`, `DealAuditRepository` (`infrastructure/persistence/`) и `SyncCursorRepository` (`infrastructure/redis/`)
- [x] 5.4 Прогнать тесты из 5.1 и зафиксировать, что они зелёные (green), регрессий нет

## 6. Очереди и планировщик (spec `deal-sync`)

- [x] 6.1 Написать тесты на `DealSyncScheduler` (идемпотентная регистрация через `upsertJobScheduler`, интервал из конфига, `attempts` и backoff), `AuditQueue` (`jobId = audit:<dealId>`, дубликат не создаёт вторую задачу) и `NotificationQueue` (постановка `{ username, message }`) и убедиться, что тест-раннер их видит
- [x] 6.2 Прогнать тесты из 6.1 и зафиксировать, что они падают (red) по ожидаемой причине
- [x] 6.3 Реализовать очереди `deal-sync`, `audit`, `notification`, `DealSyncScheduler`, `AuditQueue`, `NotificationQueue` в `infrastructure/queue/` с переносом контекста запроса по образцу из `.claude/rules/logging.md` и метриками очередей
- [x] 6.4 Прогнать тесты из 6.1 и зафиксировать, что они зелёные (green), регрессий нет

## 7. Синхронизация сделок (spec `deal-sync`)

- [x] 7.1 Написать тесты на `SyncDealsUseCase`: задача на каждую обновлённую сделку, курсор не сдвигается при сбое постановки, сдвигается на время начала запуска после успеха, окно по умолчанию без курсора, пустой список без ошибки; убедиться, что тест-раннер их видит
- [x] 7.2 Прогнать тесты из 7.1 и зафиксировать, что они падают (red) по ожидаемой причине
- [x] 7.3 Реализовать `SyncDealsUseCase` и `DealSyncProcessor` (`interface/queue/`) с ретраями и логированием сбоя после исчерпания попыток
- [x] 7.4 Прогнать тесты из 7.1 и зафиксировать, что они зелёные (green), регрессий нет

## 8. AI-агент и инструменты (spec `deal-audit`)

- [x] 8.1 Написать тесты на `AuditToolsFactory`: `getUserTelegramAccountById` возвращает username активного сотрудника или «сотрудник не найден»; `notify_responsible` ставит `{ username, message }` в `NotificationQueuePort` и возвращает `queued`; и на `DealAuditor` с подменённой моделью: разбор структурированного ответа `verdict` + `issues`, ошибка при невалидном ответе; убедиться, что тест-раннер их видит
- [x] 8.2 Прогнать тесты из 8.1 и зафиксировать, что они падают (red) по ожидаемой причине
- [x] 8.3 Реализовать `AuditToolsFactory` (`application/`) и `DealAuditor` (`infrastructure/agent/`) на `createAgent` из `langchain` с `ChatOpenAI`, `systemPrompt` с правилами аудита и порядком вызова инструментов, `responseFormat: toolStrategy(...)`; данные сделки передаются как данные, а не инструкции
- [x] 8.4 Прогнать тесты из 8.1 и зафиксировать, что они зелёные (green), регрессий нет

## 9. Аудит сделки (spec `deal-audit`)

- [x] 9.1 Написать тесты на `AuditDealUseCase`: сделка не найдена даёт `skipped` без повтора, версия уже проверена пропускается, нарушений нет без уведомления, нарушения сохраняются в результате, временный сбой CRM или LLM пробрасывается для ретрая; убедиться, что тест-раннер их видит
- [x] 9.2 Прогнать тесты из 9.1 и зафиксировать, что они падают (red) по ожидаемой причине
- [x] 9.3 Реализовать `AuditDealUseCase` и `AuditProcessor` (`interface/queue/`) с классификацией ошибок (`UnrecoverableError` для постоянных)
- [x] 9.4 Прогнать тесты из 9.1 и зафиксировать, что они зелёные (green), регрессий нет

## 10. Доставка уведомлений (spec `employee-notification`)

- [x] 10.1 Написать тесты на `Notifier` (успех, временная ошибка даёт `TransientNotifyError`, недоступный чат даёт `PermanentNotifyError`, HTTP-клиент подменён) и `DeliverNotificationUseCase` (сотрудник найден, не найден или неактивен без повтора, временная ошибка пробрасывается); убедиться, что тест-раннер их видит
- [x] 10.2 Прогнать тесты из 10.1 и зафиксировать, что они падают (red) по ожидаемой причине
- [x] 10.3 Реализовать `Notifier` (`infrastructure/telegram/`, Bot API по HTTP), `DeliverNotificationUseCase` и `NotificationProcessor` (`interface/queue/`) с ретраями и логированием
- [x] 10.4 Прогнать тесты из 10.1 и зафиксировать, что они зелёные (green), регрессий нет

## 11. Метрики и сборка модуля

- [x] 11.1 Добавить метрики `audit_deals_total{verdict}`, `notifications_total{status}`, `deal_sync_enqueued_total`, собрать `AuditAgentModule` (DI-токены портов, провайдеры, регистрация процессоров и планировщика на старте); проверить: приложение стартует, `/metrics` отдаёт новые метрики, `npm run lint` и `npm run typecheck` проходят. Тесты не нужны: проводка DI и счётчики без ветвлений, проверяется стартом и сквозным прогоном в 12.1

## 12. Сквозная проверка и API Contract

- [x] 12.1 Сквозной прогон на моках (CRM-мок, подменённые LLM и Telegram): планировщик → `deal-sync` → `audit` → `notification`; проверить: для неполных сделок сохранены результаты аудита и отправлены сообщения, для полных уведомлений нет, повторный запуск не дублирует проверки
- [x] 12.2 Сверить реализованные контракты очередей (`deal-sync`, `audit`, `notification`: имена, payload, `jobId`, ретраи) с разделом "API Contract" в architecture.md; публичных HTTP-эндпоинтов нет, убедиться, что их не добавили; зафиксировать расхождения

## 13. Code review

- [ ] 13.1 Запустить code-review (скилл `code-review`) по всем изменениям фичи - от коммита, с которого начат change, до текущего HEAD: соответствие стандартам проекта и specs этого change
- [ ] 13.2 Исправить замечания ревью (блокирующие и существенные обязательно; остальные - исправить или явно отклонить с обоснованием), результат зафиксировать коммитом
- [ ] 13.3 Повторить code-review по правкам из 13.2 и убедиться, что блокирующих замечаний нет; прогнать тесты и зафиксировать, что они зелёные
