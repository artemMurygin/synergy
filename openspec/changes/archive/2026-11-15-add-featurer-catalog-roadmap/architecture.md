# Architecture: add-featurer-catalog-roadmap

## Scope

Бэкенд-модуль `backend/src/modules/portal`: статус `rework`, поле `launchedAt`, архив агента и навыка, чтение каталога и архива. Портал `portal/src`: новые фичи `catalog` и `archive`, доработка `skills`, `decision` и навигации. Модуль `notifications` код не меняет, новая подпись статуса приходит к нему через `contracts`.

---

## Backend — Domain Model

### Entities
| Name | Status (new/existing) | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `Skill` (`domain/skill.ts`) | existing, меняется | да | `agentId`, `name`, `description`, `status`, `statusChangedAt`, **`launchedAt`**, **`archivedAt`** | Навык агента: жизненный цикл статуса и архив |
| `Agent` (`domain/agent.ts`) | existing → становится агрегатом | да | **`productIds` (непустой список, вместо `productId`)**, `slug`, `name`, **`archivedAt`** | Агент одного или нескольких продуктов, с архивом |
| `Product` (`domain/product.ts`) | existing, без изменений | — (read-only) | `slug`, `name` | Продукт каталога, заводится сидером |
| `IdeaRequest` (`domain/idea-request.ts`) | existing, без изменений | да | `decision`, `skillId` | Заявка; меняется только проверка в `AcceptRequestUseCase` |

### Aggregates
| Aggregate | Root entity | Входит в состав (entities/VO) | Инварианты, которые защищает |
|---|---|---|---|
| Skill | `Skill` | `SkillName`, `SkillStatus` | Разрешены только переходы из `SKILL_TRANSITIONS`. `launchedAt` записывается один раз, при первом `launched`. Статус архивного навыка не меняется. `archive` и `restore` идемпотентны и не трогают статус |
| Agent | `Agent` | — | Минимум один продукт. `archive` и `restore` идемпотентны, действуют во всех продуктах. Статус агент не хранит |

### Value Objects
| Name | Поля | Почему VO (immutable/self-validating) |
|---|---|---|
| `SkillStatus` (`domain/skill-status.ts`, existing) | `'planned' \| 'in_dev' \| 'testing' \| 'launched' \| 'rework'` + таблица `SKILL_TRANSITIONS` | Закрытое множество значений, разбор из строки, единственное место правила переходов |
| `AgentStatus` (`domain/agent-status-policy.ts`, new) | `code: 'working' \| 'in_development'`, `label` | Выводится, не хранится; вычисляет чистая функция |
| `SkillName` (existing) | `value` | Без изменений |

### Services
| Service | Слой (application/domain/infrastructure) | Ответственность |
|---|---|---|
| `AgentStatusPolicy` (`domain/agent-status-policy.ts`) | domain | Выводит статус агента из его видимых навыков |
| `ChangeSkillStatusUseCase` (existing) | application | Проверяет, что агент не в архиве, вызывает `skill.changeStatus`, пишет событие |
| `AcceptRequestUseCase` (existing) | application | Добавляется проверка архива навыка и агента (409) |
| `CreateSkillUseCase` (existing) | application | Добавляется проверка архива агента (409) |
| `ArchiveSkillUseCase` (new, `application/archive-skill.use-case.ts`) | application | Архивирует и восстанавливает навык, проверяет агента при восстановлении |
| `ArchiveAgentUseCase` (new, `application/archive-agent.use-case.ts`) | application | Архивирует и восстанавливает агента |
| `GetCatalogUseCase` (new, `application/get-catalog.use-case.ts`) | application | Собирает дерево каталога и применяет `AgentStatusPolicy` и `nextStatuses` |
| `GetArchiveUseCase` (new, `application/get-archive.use-case.ts`) | application | Возвращает архивных агентов и навыки |
| `CatalogRepository` (existing port) / `SlonikCatalogRepository` | domain port / infrastructure | Агент читается с `productIds` из `portal_agent_products`; добавляются `findAgentForShare`, `findAgentForUpdate`, `saveAgent`; `listAgents` скрывает архивных и отдаёт продукты списком; `seed` создаёт связи агентов с продуктами |
| `CatalogQuery` (new port `domain/ports/catalog-query.port.ts`) / `SlonikCatalogQuery` (`infrastructure/slonik-catalog.query.ts`) | domain port / infrastructure | Чтение видимого каталога и архива одним запросом каждое |
| `SkillRepository` / `SlonikSkillRepository` (existing) | port / infrastructure | Сохраняются `launched_at` и `archived_at` |
| `SkillQuery` / `SlonikSkillQuery` (existing) | port / infrastructure | Условие видимости в `list`; в `SkillView` `product` заменяется на `products[]`, добавляется `nextStatuses` |
| `SkillsController` (existing) | interface | Эндпоинты archive/restore для навыка |
| `CatalogController` (new, `interface/http/catalog.controller.ts`) | interface | `GET /portal/catalog`, `GET /portal/archive`, `POST /portal/agents/:id/archive`, `POST /portal/agents/:id/restore` |

### Method Signatures (ключевые, по каждому сервису)
| Service.Method | Params | Returns | Краткое описание |
|---|---|---|---|
| `SkillStatus.allowedNext` | `from: SkillStatus` | `readonly SkillStatus[]` | Разрешённые переходы |
| `SkillStatus.canMove` | `from, to: SkillStatus` | `boolean` | Проверка перехода |
| `Skill.changeStatus` | `to: SkillStatus, now: Date` | `void` | `SkillArchivedError` / `InvalidSkillTransitionError`; при первом `launched` ставит `launchedAt` |
| `Skill.archive` / `Skill.restore` | `now: Date` / — | `boolean` (изменилось ли состояние) | Идемпотентный архив |
| `Agent.archive` / `Agent.restore` | `now: Date` / — | `boolean` | Идемпотентный архив |
| `Agent.ensureActive` | — | `void` | `AgentArchivedError`, если агент в архиве |
| `Agent.create` / `Agent.restore` | `{ id, productIds, slug, name, archivedAt? }` | `Agent` | Пустой `productIds` → `ArgumentInvalidError` |
| `AgentStatusPolicy.statusOf` | `skills: readonly { launchedAt: Date \| null }[]` | `AgentStatus` | `working`, если есть навык с `launchedAt` |
| `ArchiveSkillUseCase.archive` / `.restore` | `skillId: string` | `SkillView` | 404 / 409 (`AgentArchivedError` при восстановлении) |
| `ArchiveAgentUseCase.archive` / `.restore` | `agentId: string` | `AgentView` | 404 |
| `GetCatalogUseCase.execute` | — | `CatalogView` (`products[] → agents[] → skills[]`) | Видимый каталог |
| `GetArchiveUseCase.execute` | — | `ArchiveView` (`agents[]`, `skills[]`) | Архив |
| `CatalogRepository.findAgentForShare` / `findAgentForUpdate` | `id: string` | `Agent \| null` | `FOR SHARE` / `FOR UPDATE` |
| `CatalogRepository.saveAgent` | `agent: Agent` | `void` | Обновляет `archived_at` |
| `CatalogQuery.loadVisible` | — | `CatalogRow[]` | Продукты + связи агент—продукт + неархивные агенты + видимые навыки (`LEFT JOIN`) |
| `CatalogQuery.loadArchive` | — | `{ agents: ArchivedAgentRow[]; skills: ArchivedSkillRow[] }` | Архив |

Новые ошибки в `domain/errors.ts`: `SkillArchivedError` (`PORTAL_SKILL_ARCHIVED`) и `AgentArchivedError` (`PORTAL_AGENT_ARCHIVED`), обе дают 409 через `portal-error-status.ts`. В `contracts/`: `skill-status-labels.ts` (+`rework`), новый `agent-status-labels.ts`. Миграция: `db/migrations/034_portal_catalog_archive.sql` (в том числе таблица `portal_agent_products`).

---

## Frontend — UI Model

### Pages
| Page | Route | Структура (ui / +model / +mediator) | Назначение |
|---|---|---|---|
| `CatalogPage` (`pages/CatalogPage.tsx`) | `/catalog` | ui + `use-catalog.ts` | Продукты и агенты со статусами |
| `AgentPage` (`pages/AgentPage.tsx`) | `/catalog/agents/:id` | ui (агент выбирается из запроса каталога) | Карточка агента и «Архивировать агента» для разработчика |
| `RoadmapPage` (`pages/RoadmapPage.tsx`) | `/roadmap` | ui + локальный state фильтра по продукту | Навыки по статусам |
| `ArchivePage` (`pages/ArchivePage.tsx`) | `/archive` (`RequireRole developer`) | ui | Архивные агенты и навыки, «Восстановить» |
| `SkillsPage` (existing) | `/skills` | ui | Фильтр «Доработка», действие «Архивировать» |

### Features (переиспользуемые модули с бизнес-логикой)
| Feature | Статус (new/existing) | Публичный API (index.ts) | model/ (хуки, api.ts) | Назначение |
|---|---|---|---|---|
| `catalog` | new | `catalogQuery`, `selectAgent`, `groupByStatus`, `CatalogList`, `AgentCard`, `RoadmapBoard`, `ArchiveAgentAction` | `catalog.api.ts`, `catalog.queries.ts`, `catalog.schema.ts`, `use-archive-agent.ts`, `roadmap.ts` (группировка) | Каталог, карточка агента, роадмап |
| `archive` | new | `archiveQuery`, `ArchiveLists` | `archive.api.ts`, `archive.queries.ts`, `archive.schema.ts`, `use-restore.ts` | Архив и восстановление |
| `skills` | existing | + `ArchiveSkillAction` | `use-change-skill-status.ts` (статус по `statusChangedAt`), новый `use-archive-skill.ts` | Действия из `nextStatuses`, архив навыка |
| `decision` | existing | без изменений API | `decision.errors` — сообщения для `PORTAL_SKILL_ARCHIVED` / `PORTAL_AGENT_ARCHIVED`, обновление `skills`/`agents` при 409 | Решение по заявке |
| `shell` | existing | `NavMenu` | — | Пункты «Каталог», «Роадмап», «Архив» |

### UI-компоненты (page-local и shared)
| Component | Расположение (features/<f>/ui · components/ui · pages) | Props (основные) | Назначение |
|---|---|---|---|
| `CatalogList` | `features/catalog/ui` | `products: CatalogProduct[]` | Секции продуктов с плитками агентов |
| `AgentTile` | `features/catalog/ui` | `agent: CatalogAgent` | Плитка: название, статус, число навыков, ссылка; одна и та же плитка повторяется в каждом продукте агента |
| `AgentCard` | `features/catalog/ui` | `agent`, `product`, `actions?: ReactNode` (слот) | Карточка с навыками |
| `AgentStatusBadge` | `features/catalog/ui` | `status: AgentStatusCode` | «Работает» / «В разработке» |
| `RoadmapBoard` | `features/catalog/ui` | `groups: RoadmapGroup[]` | Пять колонок по статусам; карточка показывает все продукты агента |
| `ArchiveAgentAction` | `features/catalog/ui` | `agentId`, `onArchived` | Кнопка и `ConfirmDialog` |
| `ArchiveLists` | `features/archive/ui` | — (сам берёт запрос) | Два списка с «Восстановить» |
| `ArchiveSkillAction` | `features/skills/ui` | `skillId` | Кнопка и `ConfirmDialog` |
| `SkillStatusAction` / `SkillAction` (existing) | `features/skills/ui` | `skill` (с `nextStatuses`) | Одно или два действия перехода |
| `SkillStatusBadge` (existing) | `features/skills/ui` | `status` | Цвета берутся из `lib/status-labels.ts` |
| `Badge`, `ConfirmDialog`, `Select`, `Alert` (existing) | `components/ui` | — | Переиспользуются, новых компонентов UI Kit нет |

Общие модули в `lib/`: `query-keys.ts` (new: `CATALOG_KEY`, `SKILLS_KEY`, `AGENTS_KEY`, `ARCHIVE_KEY`), `status-labels.ts` (+`rework`, `AGENT_STATUS_LABEL`, классы бейджей; удаляются `nextSkillStatus` и `SKILL_STATUS_FLOW`), `schemas/index.ts` (+`rework` в `skillStatusSchema`, `nextStatuses` в `skillSchema`, `products[]` вместо `product` у агента и навыка).

### Hooks (model)
| Hook | Расположение | Тип (state-хук / query options factory) | Возвращает |
|---|---|---|---|
| `catalogQuery()` | `features/catalog/model/catalog.queries.ts` | query options factory | `Catalog` |
| `useArchiveAgent()` | `features/catalog/model/use-archive-agent.ts` | мутация | инвалидирует `catalog`, `skills`, `agents`, `archive` |
| `archiveQuery()` | `features/archive/model/archive.queries.ts` | query options factory | `Archive` |
| `useRestoreAgent()` / `useRestoreSkill()` | `features/archive/model/use-restore.ts` | мутации | инвалидируют те же ключи; ошибка `PORTAL_AGENT_ARCHIVED` → сообщение |
| `useArchiveSkill()` | `features/skills/model/use-archive-skill.ts` | мутация | инвалидирует ключи |
| `useSkillStatus()` (existing) | `features/skills/ui/SkillStatusAction.tsx` | state-хук | `{ change, status, next: SkillStatus[] }` |
| `useCatalog()` | `pages/use-catalog.ts` | обёртка `useQuery(catalogQuery())` | `isInitialLoad`, данные, ошибка |

### Паттерны, которые нужно учесть при проектировании
- [x] Публичный API фичи только через `index.ts` (реэкспорт корневого UI-компонента)
- [x] Запросы к backend — через query options factory в `model/*.queries.ts` (`queryOptions({...})`), не голыми async-функциями
- [x] Ошибки API нормализуются через `ApiError` (`src/lib/errors.ts`); коды `PORTAL_SKILL_ARCHIVED` / `PORTAL_AGENT_ARCHIVED` различаются по `code`
- [ ] Для страницы с несколькими stateful-виджетами — `mediator/`-компонент без условного рендера (не нужен: на страницах один источник данных)
- [x] Layout/контейнерные компоненты принимают именованные слоты: `AgentCard` получает `actions`
- [x] Разделение `isInitialLoad` / `isRefreshing`: фильтр роадмапа клиентский, повторная загрузка каталога не схлопывает отрисованные колонки
- [x] Новые общие компоненты — в UI Kit приложения; здесь новых нет, цвета бейджей — токенами

---

## Diagrams

Диаграммы в Miro для этого change не делаются (решение пользователя); ниже текстовое описание связей.

### 1. Domain Entity Interaction
`Product *—* Agent` (через `portal_agent_products`, у агента минимум один продукт), `Agent 1—* Skill 1—* IdeaRequest (N:1 skillId)`. У `Agent` и `Skill` независимые `archivedAt`, у `Skill` есть `launchedAt`. `AgentStatusPolicy` читает видимые `Skill` агента.

### 2. External Modules Interaction
`portal` → outbox (`SkillStatusChangedEvent`, синхронно в транзакции) → `notifications` (правило `request.status-changed`, асинхронно) → `telegram`. `portal` → `auth` (guard и `@Roles`). Портал (SPA) → `GET /portal/catalog`, `GET /portal/archive`, `POST …/archive|restore`.

### 3. Layer Interaction — от Controller до Response
`SkillsController.changeStatus` → `ChangeSkillStatusUseCase` → транзакция: `SkillRepository.findForUpdate` → `CatalogRepository.findAgentForShare` → `agent.ensureActive` → `skill.changeStatus` → `SkillRepository.save(skill, from)` → outbox → `SkillQuery.findView` → `SkillResponse` с `nextStatuses`. Ошибки: `SkillNotFoundError` → 404, `SkillArchivedError` / `AgentArchivedError` / `InvalidSkillTransitionError` → 409.

---

## Confirmation Checklist
- [x] Названия entity/aggregate/VO согласованы
- [x] Названия и сигнатуры ключевых методов сервисов согласованы
- [x] Слои (pages/features/components), структура model/ui и паттерны фронта согласованы
- [x] Диаграммы взаимодействия: в Miro не нужны, текстовое описание выше
- [x] Пользователь подтвердил переход к tasks.md (после ui-design)
