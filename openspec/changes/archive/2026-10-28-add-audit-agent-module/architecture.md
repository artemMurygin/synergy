# Architecture: add-audit-agent-module

## Scope

Новый модуль `audit-agent` в `audit-agent/src/modules/audit-agent/`. Затрагивает очереди BullMQ (`deal-sync`, `audit`, `notification`), Redis (курсор), Postgres (две новые таблицы), внешние системы: CRM (мок), OpenAI, Telegram Bot API. Публичного HTTP API модуль не добавляет: входы только планировщик и очереди.

---

## Backend — Domain Model

### Entities
| Name | Status | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `Deal` | new | нет (снимок из CRM, read model) | `id`, `clientName`, `phone`, `program`, `studyForm`, `leadSource`, `pipelineStage`, `responsibleId`, `updatedAt` | Карточка сделки, полученная из CRM |
| `DealAudit` | new | да | `id`, `dealId`, `dealUpdatedAt`, `verdict`, `issues[]`, `auditedAt` | Результат проверки одной версии сделки |
| `Employee` | new | да | `id`, `crmResponsibleId`, `fullName`, `telegramUsername`, `telegramChatId`, `isActive` | Ответственный сотрудник и его Telegram |

### Aggregates
| Aggregate | Root entity | Входит в состав | Инварианты |
|---|---|---|---|
| `DealAudit` | `DealAudit` | `AuditIssue[]` | Пара `(dealId, dealUpdatedAt)` уникальна; при `verdict = ok` список проблем пуст |
| `Employee` | `Employee` | — | `crmResponsibleId` уникален; уведомляется только `isActive` с заполненным `telegramChatId` |

### Value Objects
| Name | Поля | Почему VO |
|---|---|---|
| `DealId` | `value: string` | Неизменяемый непустой идентификатор |
| `AuditIssue` | `field: RequiredField`, `reason: string` | Неизменяемое описание проблемы, поле из закрытого перечня |
| `RequiredField` | enum: `clientName`, `phone`, `program`, `studyForm`, `leadSource`, `pipelineStage` | Закрытый перечень обязательных полей |
| `AuditVerdict` | `ok` \| `violations` \| `skipped` | Закрытый набор состояний |
| `NotificationJob` | `username: string`, `message: string` | Неизменяемая полезная нагрузка задания уведомления |
| `SyncWindow` | `from: Date`, `to: Date` | Валидирует `from <= to` |

### Services
| Service | Слой | Ответственность |
|---|---|---|
| `SyncDealsUseCase` | application | Читает курсор, получает id обновлённых сделок, ставит задачи аудита, сдвигает курсор |
| `AuditDealUseCase` | application | Загружает сделку, пропускает уже проверенную версию, запускает агента с инструментом уведомления, сохраняет результат |
| Порты: `CrmGatewayPort`, `DealAuditorPort`, `NotifierPort`, `EmployeeRepositoryPort`, `DealAuditRepositoryPort`, `SyncCursorRepositoryPort`, `AuditQueuePort`, `NotificationQueuePort` | domain | Контракты внешних систем |
| `MockCrmGateway` | infrastructure | In-memory сделки вуза |
| `DealAuditor` | infrastructure | Агент на `createAgent` (`langchain` v1): инструменты, `toolStrategy` для структурированного ответа |
| `Notifier` | infrastructure | Отправка через Bot API, классификация ошибок; вызывается обработчиком уведомлений |
| `AuditToolsFactory` | application | Создаёт tools агента: `getUserTelegramAccountById(id)` (над `EmployeeRepositoryPort`) и `notify_responsible(username, message)` (ставит `NotificationJob` в `NotificationQueuePort`) |
| `DeliverNotificationUseCase` | application | По заданию: ищет сотрудника по username, вызывает `NotifierPort` |
| `NotificationQueue` | infrastructure | Постановка заданий в очередь `notification` |
| `EmployeeRepository`, `DealAuditRepository` | infrastructure | Реализации репозиториев (хранилище не отражается в имени) |
| `SyncCursorRepository` | infrastructure | Реализация хранилища курсора (хранилище не отражается в имени) |
| `AuditQueue`, `DealSyncScheduler` | infrastructure | Постановка задач аудита (реализует порт `AuditQueuePort`) и регистрация job scheduler |
| `DealSyncProcessor`, `AuditProcessor`, `NotificationProcessor` | interface | Входные адаптеры очередей, вызывают use case и маппят ошибки в retry/unrecoverable |

### Method Signatures
| Service.Method | Params | Returns | Описание |
|---|---|---|---|
| `SyncDealsUseCase.execute` | `now: Date` | `Promise<{ enqueued: number }>` | Один запуск синхронизации |
| `AuditDealUseCase.execute` | `dealId: DealId` | `Promise<DealAudit>` | Полный цикл аудита одной сделки |
| `CrmGatewayPort.listUpdatedDealIds` | `since: Date` | `Promise<DealId[]>` | Id обновлённых сделок |
| `CrmGatewayPort.getDeal` | `id: DealId` | `Promise<Deal>`, бросает `DealNotFoundError` | Полная карточка |
| `DealAuditorPort.audit` | `deal: Deal, tools: AuditTools` | `Promise<AuditIssue[]>` | Запуск tool-calling агента; проблемы по мнению LLM |
| `GetUserTelegramAccountByIdTool.invoke` | `id: string` (`responsibleId`) | `Promise<string>` (username или «сотрудник не найден») | Tool агента: ищет username в таблице сотрудников |
| `NotifyResponsibleTool.invoke` | `username: string, message: string` | `Promise<'queued'>` | Tool агента: ставит задание в очередь |
| `DeliverNotificationUseCase.execute` | `job: NotificationJob` | `Promise<void>`, бросает `TransientNotifyError` для ретрая | Находит сотрудника по username и отправляет |
| `NotificationQueuePort.enqueue` | `job: NotificationJob` | `Promise<void>` | Постановка задания |
| `EmployeeRepositoryPort.findByUsername` | `username: string` | `Promise<Employee \| null>` | Поиск получателя |
| `NotifierPort.send` | `chatId: string, text: string` | `Promise<void>`, бросает `TransientNotifyError` / `PermanentNotifyError` | Отправка в Telegram |
| `EmployeeRepositoryPort.findByResponsibleId` | `id: string` | `Promise<Employee \| null>` | Поиск ответственного |
| `DealAuditRepositoryPort.findByVersion` | `dealId, dealUpdatedAt` | `Promise<DealAudit \| null>` | Идемпотентность |
| `DealAuditRepositoryPort.save` | `audit: DealAudit` | `Promise<void>` | Сохранение и обновление статуса доставки |
| `SyncCursorRepositoryPort.get` / `set` | `—` / `value: Date` | `Promise<Date \| null>` / `Promise<void>` | Курсор синхронизации |
| `AuditQueuePort.enqueue` | `dealId: DealId` | `Promise<void>` | `jobId = audit:<dealId>` |

---

## API Contract

Публичных HTTP-эндпоинтов этот change не добавляет. Для frontend-этапа контракта нет. Служебные `/health` и `/metrics` уже существуют.

Контракты очередей:
| Очередь | Job name | Payload | Ретраи |
|---|---|---|---|
| `deal-sync` | `sync-deals` (job scheduler) | `{}` | `attempts`, exponential backoff из env |
| `notification` | `send-notification` | `{ username, message }` | `attempts`, exponential backoff из env |
| `audit` | `audit-deal` | `{ dealId: string }`, `jobId = audit:<dealId>` | `attempts`, exponential backoff из env |

Новые метрики: `audit_deals_total{verdict}`, `notifications_total{status}`, `deal_sync_enqueued_total` (в дополнение к метрикам BullMQ).

---

## Diagrams

### 1. Domain Entity Interaction
Miro link: `https://miro.com/app/board/uXjVEVAz9KQ=/?moveToWidget=3458764688453010005`

### 2. External Modules Interaction
Miro link: `https://miro.com/app/board/uXjVEVAz9KQ=/?moveToWidget=3458764688453010185`

### 3. Layer Interaction: от планировщика до уведомления
Miro link: `https://miro.com/app/board/uXjVEVAz9KQ=/?moveToWidget=3458764688453010207`

---

## Confirmation Checklist
- [x] Названия entity/aggregate/VO согласованы
- [x] Названия и сигнатуры ключевых методов сервисов согласованы
- [x] API Contract (эндпоинты, DTO, ошибки) согласован
- [x] Диаграммы взаимодействия отражают ожидаемую реализацию
- [x] Пользователь подтвердил переход к tasks.md
