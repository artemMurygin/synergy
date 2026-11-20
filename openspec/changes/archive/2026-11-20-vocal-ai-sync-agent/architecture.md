# Architecture: vocal-ai-sync-agent

## Scope

Только backend (`backend/src/modules/vocal-ai/`): новый модуль синхронизации звонков VocalAI в локальную БД и инструменты LLM-агента над этими данными. Фронтенд не затрагивается — ни у портала, ни у control-center, ни у manager-helper нет UI-поверхности для этой фичи (см. `design.md` → Non-Goals).

---

## Backend — Domain Model

### Entities
| Name | Status | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `Call` | new | yes | `callId`, `projectId`, `manager`, `client`, `callType`, `createdAt`, `callCompletedAt`, `scoredAt`, `rescoredAt`, `durationSeconds`, `totalScore`, `maxScore` | Факт звонка с итоговой оценкой; центральная сущность синхронизации |
| `CallMetricScore` | new | no | `callId`, `metricId`, `metricTitle`, `scoreValue`, `maxScore`, `reason`, `recommendations`, `isException` | Оценка звонка по одной метрике чек-листа |
| `CallTag` | new | no | `callId`, `tagId`, `tagTitle`, `value`, `valueDescription` | Присвоенный AI-тег звонка |
| `CallSummary` | new | no | `callId`, `summaryTitle`, `summaryText` | AI-саммари звонка по одному смысловому блоку |
| `CallTranscript` | new | yes | `callId` | Отдельный агрегат транскрипции — существует только после ленивой загрузки |
| `CallTranscriptLine` | new | no | `callId`, `lineIndex`, `speakerName`, `speakerRole`, `startTimeSeconds`, `endTimeSeconds`, `text` | Одна реплика транскрипции |
| `SyncedProject` | new | yes | `projectId`, `title`, `lastSyncedAt` | Конфигурация и состояние курсора синхронизации проекта VocalAI |

### Aggregates
| Aggregate | Root entity | Входит в состав | Инварианты, которые защищает |
|---|---|---|---|
| Call | `Call` | `CallMetricScore[]`, `CallTag[]`, `CallSummary[]` | Нет дублирующегося `metricId`/`tagId` на один `callId`; `upsertMany` заменяет весь набор дочерних записей звонка атомарно (не домешивает старые и новые) |
| CallTranscript | `CallTranscript` | `CallTranscriptLine[]` | `lineIndex` монотонно возрастает без пропусков; агрегат создаётся только по явному запросу (ленивая загрузка), не при обычной синхронизации |
| SyncedProject | `SyncedProject` | — | `lastSyncedAt` не уменьшается между успешными циклами синхронизации одного проекта |

### Value Objects
| Name | Поля | Почему VO |
|---|---|---|
| `CallId` | `number` (id звонка VocalAI) | Immutable, self-validating (положительное целое) — исключает путаницу с другими числовыми id в сигнатурах |
| `SyncWindow` | `fromAt: Date`, `toAt: Date` | Immutable, self-validating (`fromAt < toAt`); один тип переиспользуется и инкрементальным циклом, и стартовой выгрузкой |

### Services
| Service | Слой | Ответственность |
|---|---|---|
| `VocalAiGateway` | infrastructure | Адаптер `VocalAiGatewayPort`: SSO-логин, refresh токена (single-flight), `listCalls`, `getCall`; retry/backoff на 5xx/сетевые ошибки |
| `CallRepository` | infrastructure | Адаптер `CallRepositoryPort` (Slonik): upsert агрегата Call, выборка по фильтру, агрегированная статистика |
| `CallTranscriptRepository` | infrastructure | Адаптер `CallTranscriptRepositoryPort` (Slonik): проверка наличия, сохранение, чтение строк транскрипции |
| `SyncCursorRepository` | infrastructure | Адаптер `SyncCursorRepositoryPort` (Slonik): чтение/запись `lastSyncedAt` по `projectId` |
| `SyncProjectCallsUseCase` | application | Инкрементальный цикл: 2 запроса (по дате звонка и по дате оценки) + дедуп по `callId` + upsert + обновление курсора |
| `BackfillProjectCallsUseCase` | application | Стартовая полная постраничная выгрузка истории проекта при первом подключении |
| `ListCallsUseCase` | application | Фильтрация звонков из локального хранилища для тула `list_calls` |
| `GetCallDetailUseCase` | application | Детали звонка (метрики, теги, саммари, оценка) без транскрипции для тула `get_call` |
| `GetCallTranscriptUseCase` | application | Ленивая загрузка и постоянное кэширование транскрипции для тула `get_call_transcript` |
| `GetCallStatsUseCase` | application | Агрегированная статистика (количество, средняя оценка, доля проблемных) для тула `get_call_stats` |
| `VocalAiSyncScheduler` | infrastructure/queue | Регистрирует повторяющийся job (`upsertJobScheduler`) на каждый `projectId` из `VOCAL_AI_PROJECT_IDS` |
| `VocalAiSyncProcessor` | interface/queue | BullMQ-процессор: вызывает `BackfillProjectCallsUseCase` (первый запуск проекта) или `SyncProjectCallsUseCase` (инкремент) |
| `VocalAiAgentCapability` | interface/agent | `AgentCapability` (по образцу `TasksAgentCapability`), регистрирует тулы `createVocalAiTools` в LLM-агенте |

### Method Signatures (ключевые)
| Service.Method | Params | Returns | Краткое описание |
|---|---|---|---|
| `VocalAiGatewayPort.listCalls` | `projectId: ProjectId, window: { callWindow?: SyncWindow; scoreWindow?: SyncWindow }` | `Promise<CallDto[]>` | Один HTTP-запрос к `POST /api/calls/project/{id}` с соответствующими датами фильтра |
| `VocalAiGatewayPort.getCall` | `callId: CallId, projectId: ProjectId` | `Promise<CallDetailDto>` | `GET /api/call/{id}`, включает транскрипцию |
| `CallRepositoryPort.upsertMany` | `calls: Call[]` | `Promise<void>` | Транзакционный upsert агрегатов Call с дочерними записями |
| `CallRepositoryPort.findByFilter` | `filter: CallFilter` | `Promise<Call[]>` | Фильтрация по проекту/менеджеру/периоду/оценке/тегу/метрике |
| `CallRepositoryPort.aggregateStats` | `filter: CallFilter` | `Promise<CallStats>` | Количество звонков, средняя оценка, доля проблемных по фильтру |
| `CallTranscriptRepositoryPort.exists` | `callId: CallId` | `Promise<boolean>` | Проверка перед ленивой загрузкой |
| `CallTranscriptRepositoryPort.save` | `callId: CallId, lines: CallTranscriptLine[]` | `Promise<void>` | Идемпотентная запись (перезатирает по `callId`) |
| `SyncCursorRepositoryPort.get` / `.set` | `projectId: ProjectId` / `projectId: ProjectId, at: Date` | `Promise<Date \| null>` / `Promise<void>` | Состояние курсора синхронизации |
| `SyncProjectCallsUseCase.execute` | `projectId: ProjectId, now: Date` | `Promise<SyncResult>` | Основной инкрементальный цикл |
| `BackfillProjectCallsUseCase.execute` | `projectId: ProjectId` | `Promise<BackfillResult>` | Полная историческая выгрузка, постранично |
| `ListCallsUseCase.execute` | `filter: CallFilter` | `Promise<Call[]>` | Используется тулом `list_calls` |
| `GetCallDetailUseCase.execute` | `callId: CallId` | `Promise<CallDetailView>` | Используется тулом `get_call` |
| `GetCallTranscriptUseCase.execute` | `callId: CallId, projectId: ProjectId` | `Promise<CallTranscriptLine[]>` | Используется тулом `get_call_transcript`; дозагружает при отсутствии |
| `GetCallStatsUseCase.execute` | `filter: CallFilter` | `Promise<CallStats>` | Используется тулом `get_call_stats` |

---

## Frontend — UI Model

Не применимо. Это изменение не создаёт и не изменяет ни одной UI-поверхности в `portal`, `control-center` или `manager-helper` — см. `design.md` → Non-Goals («управление списком проектов через UI» явно вне рамок). Pages/Features/Components/Hooks не заполняются.

---

## Diagrams

### 1. Domain Entity Interaction
Связи Call (aggregate root) → CallMetricScore/CallTag/CallSummary (1→many), Call → CallTranscript (отдельный агрегат, лениво), CallTranscript → CallTranscriptLine (1→many), SyncedProject → Call (по projectId), value objects CallId и SyncWindow.

Miro link: https://miro.com/app/board/uXjVENAqLog=/ (фрейм «1. Domain Entity Interaction»)

### 2. External Modules Interaction
Модуль `vocal-ai` (scheduler → processor → gateway/use cases → repositories, тулы агента) во взаимодействии с внешним VocalAI API, SSO Синергии/Keycloak, общей очередью BullMQ/Redis, общим PostgreSQL и модулем `assistant`, вызывающим тулы.

Miro link: https://miro.com/app/board/uXjVENAqLog=/ (фрейм «2. External Modules Interaction»)

### 3. Layer Interaction — от триггера до ответа
Два потока: (A) `VocalAiSyncScheduler → VocalAiSyncProcessor → SyncProjectCallsUseCase → VocalAiGateway (2 запроса) + CallRepository.upsertMany → PostgreSQL`, с изоляцией ошибки одного проекта; (B) вызов тула агентом: `assistant → VocalAiAgentCapability tool() → ListCallsUseCase → CallRepository.findByFilter → PostgreSQL → json-ответ модели`, без обращения к внешнему API.

Miro link: https://miro.com/app/board/uXjVENAqLog=/ (фрейм «3. Layer Interaction»)

---

## Confirmation Checklist
- [ ] Названия entity/aggregate/VO согласованы
- [ ] Названия и сигнатуры ключевых методов сервисов согласованы
- [ ] Слои (pages/features/components), структура model/ui и паттерны фронта согласованы — N/A, фронтенда нет
- [ ] Диаграммы взаимодействия отражают ожидаемую реализацию
- [ ] Пользователь подтвердил переход к tasks.md
