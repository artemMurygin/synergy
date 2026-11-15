<!--
  Правила выполнения:
  - Бэкенд: `cd backend`, тесты `npx vitest run <путь>`, типы `npm run typecheck`, линт `npm run lint`.
    Интеграционные тесты БД идут только при заданной `PROGRAMS_ETL_TEST_ADMIN_URL` (иначе пропускаются):
    перед группой 1 убедиться, что переменная задана, иначе миграционные и репозиторные тесты ничего не доказывают.
  - Портал: `cd portal`, тесты `npx vitest run <путь>`, типы `npm run typecheck`.
  - Последняя миграция в репозитории — 033; новая — `034_portal_catalog_archive.sql` (сверить `ls backend/db/migrations`).
  - Макеты — в `design/synergy-design.pen`, фрейм Portal (`t2DLO`), Node ID — в `frames` групп вёрстки и в `ui-design.md`.
    Фрейм читать через `mcp__pencil__*` (`execute`/`Get`), `.pen` иначе не читать и не править.
  - Модуль бэкенда — `backend/src/modules/portal` (ниже пути относительно него, если не указано иное).
-->

## 1. backend, БД: миграция `034_portal_catalog_archive`
> track: backend
> depends: —
> specs: featurer-catalog → «Продукты и агенты из seed»; featurer-catalog → «Поля навыка»; featurer-catalog → «Жизненный цикл статуса навыка»; featurer-catalog → «Архивация агента»
> arch: Entities/Skill; Entities/Agent
> files: backend/db/migrations/034_portal_catalog_archive.sql; backend/src/database/postgres/portal-catalog-archive-migration.spec.ts
> frames: —

- [x] 1.1 TDD: миграция создаёт `portal_agent_products (agent_id, product_id)` с первичным ключом по паре, переносит в неё все пары из `portal_agents.product_id` и удаляет эту колонку; агент может иметь связи с двумя продуктами, дубль пары отвергается; миграция допускает статус `rework` и отвергает неизвестный; добавляет `portal_skills.launched_at`, `portal_skills.archived_at`, `portal_agents.archived_at`; заполняет `launched_at = status_changed_at` у навыков в `launched`; `CHECK (status <> 'launched' OR launched_at IS NOT NULL)` отвергает запущенный навык без времени; существующие строки не теряются. Тесты: backend/src/database/postgres/portal-catalog-archive-migration.spec.ts (по образцу соседних `*-migration.spec.ts`). Реализация: backend/db/migrations/034_portal_catalog_archive.sql (шаги из design.md «Migration Plan», откат комментарием). Готово, когда тест green при заданной `PROGRAMS_ETL_TEST_ADMIN_URL`

## 2. backend, домен: переходы статуса, архив, статус агента
> track: backend
> depends: —
> specs: featurer-catalog → «Продукты и агенты из seed»; featurer-catalog → «Жизненный цикл статуса навыка»; featurer-catalog → «Поля навыка»; featurer-catalog → «Выведенный статус агента»; featurer-catalog → «Архивация навыка»; featurer-catalog → «Архивация агента»; featurer-requests → «Статус заявки для автора»
> arch: Value Objects/SkillStatus; Value Objects/AgentStatus; Entities/Skill; Entities/Agent; Aggregates/Skill; Aggregates/Agent; Services/AgentStatusPolicy
> files: backend/src/modules/portal/domain/skill-status.ts; domain/skill.ts; domain/agent.ts; domain/agent-status-policy.ts; domain/errors.ts; domain/*.spec.ts; contracts/skill-status-labels.ts; contracts/agent-status-labels.ts
> frames: —

- [x] 2.1 TDD: `SkillStatus` знает `rework`; `allowedNext` и `canMove` разрешают ровно `planned→in_dev`, `in_dev→testing`, `testing→launched|rework`, `launched→rework`, `rework→testing`; `SKILL_STATUS_LABELS.rework = 'Доработка'`. Тесты: domain/skill-status.spec.ts. Реализация: domain/skill-status.ts (таблица `SKILL_TRANSITIONS`, удалить `next`/`canAdvanceTo`), contracts/skill-status-labels.ts
- [x] 2.2 TDD: `Skill.changeStatus(to, now)` вместо `advance`: недопустимый переход → `InvalidSkillTransitionError`; архивный навык → `SkillArchivedError`; первый `launched` пишет `launchedAt`, повторный не меняет; `archive(now)`/`restore()` идемпотентны (возвращают, изменилось ли), статус и `launchedAt` не трогают; `create` даёт пустые `launchedAt`/`archivedAt`. Тесты: domain/skill.spec.ts. Реализация: domain/skill.ts, domain/errors.ts (`SkillArchivedError` `PORTAL_SKILL_ARCHIVED`)
- [x] 2.3 TDD: `Agent` — агрегат с непустым `productIds` (вместо `productId`; пустой список → `ArgumentInvalidError`) и `archivedAt`, `archive(now)`/`restore()` идемпотентны, `ensureActive()` бросает `AgentArchivedError`. Тесты: domain/agent.spec.ts. Реализация: domain/agent.ts (интерфейс → `AggregateRoot`, `create`/`restore`), domain/errors.ts (`AgentArchivedError` `PORTAL_AGENT_ARCHIVED`); поправить места, где `Agent` создавался литералом (сидер, `slonik-catalog.repository.ts`, `test-doubles.ts`), чтобы typecheck проходил
- [x] 2.4 TDD: `AgentStatusPolicy.statusOf(skills)` → `working` при навыке с `launchedAt` (в любом статусе, включая `rework` и `testing`), иначе `in_development`; пустой список → `in_development`; подписи «Работает» / «В разработке». Тесты: domain/agent-status-policy.spec.ts. Реализация: domain/agent-status-policy.ts, contracts/agent-status-labels.ts

## 3. backend, инфраструктура: репозитории записи
> track: backend
> depends: 1, 2
> specs: featurer-catalog → «Продукты и агенты из seed»; featurer-catalog → «Поля навыка»; featurer-catalog → «Архивация навыка»; featurer-catalog → «Архивация агента»; featurer-catalog → «Список агентов»
> arch: Services/CatalogRepository; Services/SkillRepository
> files: backend/src/modules/portal/domain/ports/catalog-repository.port.ts; infrastructure/slonik-catalog.repository.ts; infrastructure/slonik-skill.repository.ts; infrastructure/postgres-portal.repositories.spec.ts; application/test-doubles.ts; application/seed-portal-catalog.use-case.spec.ts; application/list-agents.use-case.ts
> frames: —

- [x] 3.1 TDD: `SlonikSkillRepository` сохраняет и читает `launched_at`, `archived_at`; условное обновление по `expectedStatus` сохраняется; архивация (`save` без смены статуса) не трогает `status`. Тесты: infrastructure/postgres-portal.repositories.spec.ts. Реализация: infrastructure/slonik-skill.repository.ts
- [x] 3.2 TDD: агент читается с `productIds` из `portal_agent_products`; `listAgents` отдаёт каждого агента один раз со списком продуктов (`AgentWithProducts`); `seed`: агент с одним `slug` у двух продуктов — одна запись и две связи, повторный запуск добавляет недостающие связи и не удаляет существующие, `archived_at` и имя не меняются. Тесты: infrastructure/postgres-portal.repositories.spec.ts, application/seed-portal-catalog.use-case.spec.ts. Реализация: infrastructure/slonik-catalog.repository.ts, application/list-agents.use-case.ts
- [x] 3.3 TDD: `CatalogRepository.findAgentForShare` (`FOR SHARE`), `findAgentForUpdate` (`FOR UPDATE`), `saveAgent` (только `archived_at`); `findAgent*` возвращают `archivedAt` и `productIds`; `listAgents` скрывает архивных. Тесты: infrastructure/postgres-portal.repositories.spec.ts. Реализация: domain/ports/catalog-repository.port.ts, infrastructure/slonik-catalog.repository.ts; in-memory двойники в application/test-doubles.ts

## 4. backend, инфраструктура: чтение каталога, архива, навыков
> track: backend
> depends: 1, 2
> specs: featurer-catalog → «Каталог для всех»; featurer-catalog → «Архив для разработчика»; featurer-catalog → «Список навыков»
> arch: Services/CatalogQuery; Services/SkillQuery
> files: backend/src/modules/portal/domain/ports/catalog-query.port.ts; domain/ports/skill-query.port.ts; infrastructure/slonik-catalog.query.ts; infrastructure/slonik-skill.query.ts; infrastructure/postgres-portal.repositories.spec.ts
> frames: —

- [x] 4.1 TDD: `CatalogQuery.loadVisible()` одним запросом: все продукты (и без агентов), связи агент—продукт (агент из двух продуктов приходит в обоих), неархивные агенты, навыки с `s.archived_at IS NULL AND a.archived_at IS NULL`, поля `launchedAt`, сортировка продукты/агенты по `slug`, навыки по названию. Тесты: infrastructure/postgres-portal.repositories.spec.ts. Реализация: domain/ports/catalog-query.port.ts, infrastructure/slonik-catalog.query.ts
- [x] 4.2 TDD: `CatalogQuery.loadArchive()`: архивные агенты с продуктами, числом навыков без собственного архива и `archivedAt`; навыки с `archived_at IS NOT NULL` с агентом, продуктами агента, статусом; навыки архивного агента без своего архива не входят. Тесты: тот же spec. Реализация: infrastructure/slonik-catalog.query.ts
- [x] 4.3 TDD: `SkillQuery.list` скрывает архивные навыки и навыки архивных агентов; `findView` по id возвращает навык и в архиве (нужен для ответа archive/restore); фильтр `rework` работает. Тесты: тот же spec. Реализация: infrastructure/slonik-skill.query.ts, domain/ports/skill-query.port.ts (`archivedAt` и `products[]` вместо `product` в `SkillView`; навык агента из двух продуктов — одна строка)

## 5. backend, application: смена статуса, решение, архивация
> track: backend
> depends: 2
> specs: featurer-catalog → «Жизненный цикл статуса навыка»; featurer-catalog → «Поля навыка»; featurer-catalog → «Архивация навыка»; featurer-catalog → «Архивация агента»; featurer-requests → «Решение «принять в навык»»
> arch: Services/ChangeSkillStatusUseCase; Services/AcceptRequestUseCase; Services/CreateSkillUseCase; Services/ArchiveSkillUseCase; Services/ArchiveAgentUseCase
> files: backend/src/modules/portal/application/change-skill-status.use-case.ts; accept-request.use-case.ts; create-skill.use-case.ts; archive-skill.use-case.ts; archive-agent.use-case.ts; application/*.spec.ts; application/test-doubles.ts
> frames: —

- [x] 5.1 TDD: `ChangeSkillStatusUseCase`: блокирует навык, затем агента (`findAgentForShare`), `agent.ensureActive()`, `skill.changeStatus`; архивный навык или агент → 409-ошибка без события; переход в `rework` пишет событие с `from/to`. Тесты: application/change-skill-status.use-case.spec.ts. Реализация: application/change-skill-status.use-case.ts
- [x] 5.2 TDD: `AcceptRequestUseCase` и `CreateSkillUseCase`: архивный навык → `SkillArchivedError`, навык архивного агента и создание навыка у архивного агента → `AgentArchivedError`; заявка остаётся `pending`, навык не создаётся. Тесты: application/accept-request.use-case.spec.ts, application/skills.use-cases.spec.ts. Реализация: application/accept-request.use-case.ts, application/create-skill.use-case.ts
- [x] 5.3 TDD: `ArchiveSkillUseCase.archive/restore`: 404 для неизвестного; идемпотентность без `save`; `restore` при архивном агенте → `AgentArchivedError`; возвращает `SkillView`; событие смены статуса не пишется. Тесты: application/archive-skill.use-case.spec.ts. Реализация: application/archive-skill.use-case.ts
- [x] 5.4 TDD: `ArchiveAgentUseCase.archive/restore`: `findAgentForUpdate`, 404, идемпотентность, навыки агента не трогаются, возвращает `AgentView`. Тесты: application/archive-agent.use-case.spec.ts. Реализация: application/archive-agent.use-case.ts

## 6. backend, application: чтение каталога и архива, `nextStatuses`
> track: backend
> depends: 2
> specs: featurer-catalog → «Каталог для всех»; featurer-catalog → «Выведенный статус агента»; featurer-catalog → «Архив для разработчика»
> arch: Services/GetCatalogUseCase; Services/GetArchiveUseCase
> files: backend/src/modules/portal/application/get-catalog.use-case.ts; get-archive.use-case.ts; skill-view.ts; application/*.spec.ts
> frames: —

- [x] 6.1 TDD: `GetCatalogUseCase` собирает дерево продукт → агенты (агент из двух продуктов в обеих ветках с одинаковыми навыками и статусом и полным списком `products`; статус по `AgentStatusPolicy`, число навыков) → навыки (`nextStatuses` из `SkillStatus.allowedNext`); продукт без агентов с пустым списком. Тесты: application/get-catalog.use-case.spec.ts. Реализация: application/get-catalog.use-case.ts
- [x] 6.2 TDD: `GetArchiveUseCase` возвращает агентов и навыки из `loadArchive`; `SkillView` получает `nextStatuses` (единая функция маппинга для списка навыков, архивации и смены статуса). Тесты: application/get-archive.use-case.spec.ts, application/skills.use-cases.spec.ts. Реализация: application/get-archive.use-case.ts, application/skill-view.ts

## 7. backend, HTTP: контроллеры, коды ошибок, модуль
> track: backend
> depends: 3, 4, 5, 6
> specs: featurer-catalog → «Каталог для всех»; featurer-catalog → «Архив для разработчика»; featurer-catalog → «Создание и смена статуса навыка только разработчиком»; featurer-catalog → «Архивация навыка»; featurer-catalog → «Архивация агента»; featurer-catalog → «Список навыков»
> arch: Services/CatalogController; Services/SkillsController
> files: backend/src/modules/portal/interface/http/catalog.controller.ts; catalog.controller.spec.ts; catalog.responses.ts; skills.controller.ts; skills.controller.spec.ts; skills.responses.ts; skills.schemas.ts; interface/portal-error-status.ts; portal.module.ts; portal-flow.e2e.spec.ts
> frames: —

- [x] 7.1 TDD: `AgentResponse` отдаёт `products[]` вместо `product` (в `GET /portal/agents` и ответах archive/restore); `CatalogController`: `GET /portal/catalog` (любой вошедший, 401 без токена), `GET /portal/archive`, `POST /portal/agents/:id/archive|restore` (`@Roles('developer')`, 403 сотруднику, 404, 200 с `AgentResponse`); Swagger-описания. Тесты: interface/http/catalog.controller.spec.ts. Реализация: interface/http/catalog.controller.ts, catalog.responses.ts
- [x] 7.2 TDD: `SkillsController`: `POST /portal/skills/:id/archive|restore` (developer), `rework` в схеме статуса и фильтре, `nextStatuses`, `archivedAt` и `products[]` (вместо `product`) в `SkillResponse`; `PORTAL_SKILL_ARCHIVED`/`PORTAL_AGENT_ARCHIVED` → 409 в `portal-error-status.ts`; регистрация use-case'ов и `CatalogQuery` в `portal.module.ts`. Тесты: interface/http/skills.controller.spec.ts. Реализация: skills.controller.ts, skills.responses.ts, skills.schemas.ts, portal-error-status.ts, portal.module.ts
- [x] 7.3 TDD: сквозной e2e: агент из двух продуктов виден в обоих продуктах каталога и один раз в `GET /portal/agents`; навык `testing → launched → rework → testing`, агент остаётся `working` в каталоге, автор видит «Доработка»; архивация навыка убирает его из каталога и списка, восстановление агента не возвращает отдельно архивированный навык; принятие в архивный навык → 409. Тесты: portal-flow.e2e.spec.ts. Реализация: правки по результату

## 8. portal: контракт API, общие словари и ключи кэша
> track: portal
> depends: —
> specs: featurer-portal-ui → «Мои заявки»; featurer-portal-ui → «Навыки и смена статуса»; featurer-catalog-ui → «Каталог»; featurer-catalog-ui → «Архив»
> arch: Features/catalog; Features/archive; Features/skills
> files: portal/src/lib/schemas/index.ts; portal/src/lib/schemas/schemas.test.ts; portal/src/lib/status-labels.ts; portal/src/styles/index.css; portal/src/lib/query-keys.ts; portal/src/features/skills/model/skills.queries.ts
> frames: —

- [x] 8.1 TDD: Zod-схемы: `rework` в `skillStatusSchema` и `requestStatusCodeSchema`; `products[]` вместо `product` у агента и навыка; `nextStatuses` и `archivedAt` у навыка; схемы ответа каталога (`products → agents{status{code,label}, skillCount} → skills`) и архива (`agents`, `skills`) по контракту design.md п. 5; разбор примеров ответов и отказ на неизвестном статусе. Тесты: portal/src/lib/schemas/schemas.test.ts. Реализация: portal/src/lib/schemas/index.ts
- [x] 8.2 `lib/status-labels.ts`: подпись и класс бейджа `rework` (фон `warning-soft`, точка `warning`, текст `ink-80`; добавить токен `--warning-soft: #FDF1DC` в `src/styles/index.css`), `AGENT_STATUS_LABEL` и классы бейджа агента, `lib/query-keys.ts` с `CATALOG_KEY`, `SKILLS_KEY`, `AGENTS_KEY`, `ARCHIVE_KEY`, `skills.queries.ts` берёт ключ оттуда. Без тестов: словари и константы, покрываются тестами групп 9–13; готово, когда typecheck проходит

## 9. portal: навыки — переходы из `nextStatuses`, «Доработка», архивация навыка, решение по заявке
> track: portal
> depends: 8
> specs: featurer-portal-ui → «Навыки и смена статуса»; featurer-portal-ui → «Очередь и решение для разработчика»; featurer-portal-ui → «Мои заявки»
> arch: Features/skills; Features/decision; UI-компоненты/SkillStatusAction; UI-компоненты/ArchiveSkillAction; Hooks/useSkillStatus; Hooks/useArchiveSkill; Pages/SkillsPage
> files: portal/src/lib/status-labels.ts; portal/src/features/skills/ui/SkillPicker.tsx; portal/src/features/skills/ui/SkillsTable.tsx; portal/src/test/helpers.tsx; portal/src/features/skills/ui/SkillStatusAction.tsx; ui/SkillStatusAction.test.tsx; ui/ArchiveSkillAction.tsx; ui/ArchiveSkillAction.test.tsx; model/use-archive-skill.ts; model/use-change-skill-status.ts; features/skills/index.ts; features/decision/model/*; portal/src/pages/SkillsPage.tsx
> frames: JFA3l; Os9Zq; UiVAy; sz6Rg; бейджи PJh3x

- [x] 9.1 TDD: `useSkillStatus`/`SkillAction` строят действия из `skill.nextStatuses` (для `testing` — «Запустить» и «На доработку», для `launched` — «На доработку», для `rework` — «На тестирование»); актуальный статус выбирается по `statusChangedAt`, а не по порядку; 409 показывает сообщение и обновлённый навык. Тесты: features/skills/ui/SkillStatusAction.test.tsx. Реализация: SkillStatusAction.tsx, use-change-skill-status.ts; удалить `nextSkillStatus` и `SKILL_STATUS_FLOW` из `lib/status-labels.ts`. Вёрстка по фрейму из ui-design.md, сверка с макетом в этой задаче
- [x] 9.2 TDD: `ArchiveSkillAction` + `useArchiveSkill`: подтверждение через `ConfirmDialog`, после успеха навык пропадает из списка, инвалидируются `skills`, `catalog`, `archive`; ошибка показывается. Тесты: features/skills/ui/ArchiveSkillAction.test.tsx. Реализация: ui/ArchiveSkillAction.tsx, model/use-archive-skill.ts; встроить иконку-кнопку архивации (с `aria-label`) в строку `SkillsTable`, чип фильтра и плитку сводки «Доработка» в `SkillsPage`
- [x] 9.3 TDD: продукты списком: `SkillsTable` и `SkillPicker` показывают все продукты агента через запятую, фильтр продукта в `SkillsPage` оставляет навык, если среди продуктов его агента есть выбранный; фикстуры в `test/helpers.tsx` переведены на `products`. Тесты: features/skills/ui/SkillsTable.test.tsx, features/skills/ui/SkillPicker.test.tsx, pages/SkillsPage.test.tsx. Реализация: SkillsTable.tsx, SkillPicker.tsx, pages/SkillsPage.tsx
- [x] 9.4 TDD: решение по заявке: 409 с `PORTAL_SKILL_ARCHIVED`/`PORTAL_AGENT_ARCHIVED` показывает сообщение об архиве, перезапрашивает `skills` и `agents`, заявка остаётся на экране; 409 «решение уже принято» работает как раньше. Тесты: features/decision/model/decision.test.tsx. Реализация: features/decision/model/*

## 10. portal: фича `catalog` и страница «Каталог»
> track: portal
> depends: 8
> specs: featurer-catalog-ui → «Каталог»
> arch: Features/catalog; Pages/CatalogPage; UI-компоненты/CatalogList; UI-компоненты/AgentTile; UI-компоненты/AgentStatusBadge; Hooks/catalogQuery; Hooks/useCatalog
> files: portal/src/features/catalog/**; portal/src/pages/CatalogPage.tsx; portal/src/pages/CatalogPage.test.tsx; portal/src/pages/use-catalog.ts
> frames: w8nkQG; g09jis; TtG4m; wzYF1; NLvZB; T2PcO; AgentTile / Master DVrBF

- [x] 10.1 TDD: `catalog.api.ts` + `catalogQuery()` (`queryOptions`, ключ `CATALOG_KEY`, разбор схемой), `selectAgent(catalog, id)` и `groupByStatus(catalog, productId?)` (порядок «Запланировано», «В разработке», «Тестируется», «Доработка», «Запущено»; навык агента из двух продуктов — один раз; фильтр оставляет навык, если агент входит в продукт). Тесты: features/catalog/model/catalog.test.ts. Реализация: features/catalog/model/catalog.api.ts, catalog.queries.ts, roadmap.ts, features/catalog/index.ts
- [x] 10.2 TDD: `CatalogPage`: секции продуктов, агент из двух продуктов есть в обеих секциях с подписью «Также в: …» (у агента с одним продуктом подписи нет), плитки ряда выровнены по высоте, `AgentTile` (название, `AgentStatusBadge`, число навыков, ссылка на `/catalog/agents/:id`), «Агентов пока нет», загрузка, ошибка с «Повторить». Тесты: pages/CatalogPage.test.tsx. Реализация: features/catalog/ui/CatalogList.tsx, AgentTile.tsx, AgentStatusBadge.tsx, pages/CatalogPage.tsx, pages/use-catalog.ts. Вёрстка 1440/360 по фреймам из ui-design.md, сверка с макетом в этой задаче

## 11. portal: карточка агента и архивация агента
> track: portal
> depends: 10
> specs: featurer-catalog-ui → «Карточка агента»
> arch: Pages/AgentPage; UI-компоненты/AgentCard; UI-компоненты/ArchiveAgentAction; Hooks/useArchiveAgent
> files: portal/src/features/catalog/ui/AgentCard.tsx; ui/ArchiveAgentAction.tsx; ui/*.test.tsx; model/use-archive-agent.ts; portal/src/pages/AgentPage.tsx; portal/src/pages/AgentPage.test.tsx
> frames: X5ueK2; Wzwo9; P2NEEr; EUSDK; v6kVp; SYM6t; o1uVII; MfgiP

- [x] 11.1 TDD: `AgentPage`: агент из `catalogQuery` по `id` со всеми продуктами, навыки с бейджем статуса и датой, пустое состояние, «Агент не найден» со ссылкой на каталог (неизвестный или архивный). Тесты: pages/AgentPage.test.tsx. Реализация: features/catalog/ui/AgentCard.tsx (слот `actions`), pages/AgentPage.tsx. Вёрстка 1440/360 по фреймам из ui-design.md, сверка с макетом в этой задаче
- [x] 11.2 TDD: `ArchiveAgentAction` + `useArchiveAgent`: видна только роли `developer`; подтверждение с текстом, что агент скроется из всех продуктов вместе с навыками; после успеха переход в `/catalog`, инвалидируются `catalog`, `skills`, `agents`, `archive`. Тесты: features/catalog/ui/ArchiveAgentAction.test.tsx. Реализация: ui/ArchiveAgentAction.tsx, model/use-archive-agent.ts

## 12. portal: роадмап
> track: portal
> depends: 10
> specs: featurer-catalog-ui → «Роадмап»
> arch: Pages/RoadmapPage; UI-компоненты/RoadmapBoard
> files: portal/src/features/catalog/ui/RoadmapBoard.tsx; ui/RoadmapBoard.test.tsx; portal/src/pages/RoadmapPage.tsx; portal/src/pages/RoadmapPage.test.tsx
> frames: jwTf0; McBIe; giz1F; FXCNu; DB7VT; noz8f; Roadmap Card / Master oU4vY

- [x] 12.1 TDD: `RoadmapPage`: пять групп в заданном порядке, карточка навыка (название, агент, все продукты агента) ведёт в карточку агента, фильтр по продукту без повторной загрузки, пустая группа, загрузка и ошибка с повтором; на 360 — раскладка из ui-design.md без горизонтальной прокрутки страницы. Тесты: pages/RoadmapPage.test.tsx. Реализация: features/catalog/ui/RoadmapBoard.tsx, pages/RoadmapPage.tsx. Вёрстка 1440/360 по фреймам из ui-design.md, сверка с макетом в этой задаче

## 13. portal: фича `archive` и страница «Архив»
> track: portal
> depends: 8
> specs: featurer-catalog-ui → «Архив»
> arch: Features/archive; Pages/ArchivePage; UI-компоненты/ArchiveLists; Hooks/archiveQuery; Hooks/useRestoreAgent; Hooks/useRestoreSkill
> files: portal/src/features/archive/**; portal/src/pages/ArchivePage.tsx; portal/src/pages/ArchivePage.test.tsx
> frames: TMxSc; n71RVP; TkkdR; bFSZ1; Ifakx

- [x] 13.1 TDD: `archive.api.ts`, `archiveQuery()`, `useRestoreAgent`/`useRestoreSkill`: инвалидируют `archive`, `catalog`, `skills`, `agents`; `PORTAL_AGENT_ARCHIVED` → сообщение «Сначала восстановите агента». Тесты: features/archive/model/archive.test.tsx. Реализация: features/archive/model/*, features/archive/index.ts
- [x] 13.2 TDD: `ArchivePage`/`ArchiveLists`: два списка с продуктами, числом навыков у агента («N навыков вернутся вместе с агентом»), датой архивации и «Восстановить», запись пропадает после восстановления, пустые состояния, `Alert` ошибки восстановления. Тесты: pages/ArchivePage.test.tsx. Реализация: features/archive/ui/ArchiveLists.tsx, pages/ArchivePage.tsx. Вёрстка 1440/360 по фреймам из ui-design.md, сверка с макетом в этой задаче

## 14. portal: маршруты и навигация
> track: portal
> depends: 9, 10, 11, 12, 13
> specs: featurer-portal-ui → «Видимость разделов по роли»
> arch: Features/shell; Pages/CatalogPage; Pages/AgentPage; Pages/RoadmapPage; Pages/ArchivePage
> files: portal/src/router.tsx; portal/src/App.test.tsx; portal/src/features/shell/NavMenu.tsx; portal/src/features/shell/NavMenu.test.tsx; portal/src/layouts/AppLayout.tsx
> frames: компактная шапка pIs6h (1024 H1SHNA, 1280 gcC0k, 1440 m6EWr); пункты меню sHjzg; m1RwQC; D0rSYB; y5Y4Xi; 360 Y2l3rG; t9jCgZ; R51iZ

- [x] 14.1 TDD: маршруты `/catalog`, `/catalog/agents/:id`, `/roadmap` внутри `RequireAuth`, `/archive` внутри `RequireRole role="developer"`; сотрудник по прямому адресу `/archive` попадает в «Мои заявки» без запроса архива. Тесты: portal/src/App.test.tsx. Реализация: portal/src/router.tsx
- [x] 14.2 TDD: `NavMenu`: «Каталог» и «Роадмап» для всех, «Архив» только для `developer`; меню администратора и обеих ролей по спеке; компактная шапка по `pIs6h` и таблице размеров из ui-design.md, раздел 6 (высота 56, пункты 13/600 с шагом 12, бренд «Портал разработки» от 1280 и «Портал» ниже, без «Synergy», имя с многоточием, роль в `title`), девять пунктов обеих ролей помещаются в одну строку на 1024, 1280 и 1440; на 360 — как в макете. Тесты: features/shell/NavMenu.test.tsx. Реализация: features/shell/NavMenu.tsx. Вёрстка по фрейму из ui-design.md, сверка с макетом в этой задаче

## 15. Интеграционная проверка и документация
> track: integration
> depends: 7, 14
> specs: featurer-catalog → «Каталог для всех»; featurer-catalog-ui → «Каталог»; featurer-catalog-ui → «Роадмап»; featurer-catalog-ui → «Архив»
> arch: —
> files: portal/src/lib/schemas/**; FEATURER_ROADMAP.md
> frames: —

- [x] 15.1 Сверка контракта фронт-бэк: Zod-схемы портала разбирают реальные ответы `GET /portal/catalog`, `GET /portal/archive`, `GET /portal/skills`, `POST …/archive|restore` (запуск бэкенда, запросы под `developer` и сотрудником, разбор ответов схемами). Готово, когда расхождений нет или они исправлены с тестом
- [ ] 15.2 Сквозной сценарий в браузере (`npm run dev`, Playwright MCP): разработчик проводит навык `testing → launched → rework`, сотрудник видит агента «Работает» в каталоге, навык в колонке «Доработка» роадмапа и статус заявки «Доработка»; архивация и восстановление агента. Один скриншот на экран
- [x] 15.3 Обновить раздел «Текущее состояние кода» в `FEATURER_ROADMAP.md` (Э2 реализован, отметка о проверке). Без тестов: документация

## 16. Code review
> track: review
> depends: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15

- [ ] 16.1 Code review всех изменений change от base commit по измерениям: соответствие specs/design, стандарты проекта, корректность (выполняет фаза Review workflow `apply-openspec-change`)
- [ ] 16.2 Исправить blocking и major (дефекты поведения — через тест, воспроизводящий ошибку), не больше 2 раундов ревью; оставшиеся minor перечислить в итоге; регрессия зелёная
