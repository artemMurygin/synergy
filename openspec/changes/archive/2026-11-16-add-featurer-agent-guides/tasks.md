## 1. portal (backend), миграция 038 и домен: инструкция и доступ отделов
> track: backend
> depends: —
> specs: featurer-agent-guides → «Правка инструкции разработчиком»; featurer-catalog → «Отделы, которым доступен продукт»; featurer-catalog → «Назначение отделов продукту»
> arch: Entities/AgentGuide; Entities/ProductAccess; Aggregates/AgentGuide; Aggregates/ProductAccess; Value Objects/GuideBody; Value Objects/DepartmentRef; Services/AgentGuideRepository; Services/AgentGuideQuery; Services/ProductAccessRepository; Services/DepartmentLookupPort
> files: backend/db/migrations/038_portal_guides_product_access.sql; backend/src/modules/portal/domain/guide-body.ts; agent-guide.ts; product-access.ts; errors.ts; backend/src/modules/portal/domain/ports/agent-guide-*.port.ts; product-access-repository.port.ts; department-lookup.port.ts; catalog-query.port.ts; backend/src/modules/portal/interface/portal-error-status.ts
> frames: —

- [x] 1.1 Миграция `038_portal_guides_product_access.sql` (после 037 из `add-featurer-bug-reports`): `portal_agent_guides` и `portal_product_departments` с `department_id TEXT REFERENCES auth_departments ON DELETE CASCADE`, индекс по `department_id`, комментарий с откатом — по design.md §1. Без тестов: SQL, проверяется в группе 9
- [x] 1.2 TDD: `GuideBody.of` — trim по краям, пусто → `null`, > 50 000 после trim → `ArgumentInvalidError`, HTML и внутренние пустые строки сохраняются; `AgentGuide.write`. Тесты: backend/src/modules/portal/domain/guide-body.spec.ts, agent-guide.spec.ts. Реализация: domain/guide-body.ts, agent-guide.ts
- [x] 1.3 TDD: `ProductAccess.of` схлопывает повторы и сохраняет порядок первого появления; `DepartmentNotFoundError` (`PORTAL_DEPARTMENT_NOT_FOUND` → 404) и маппинг. Тесты: domain/product-access.spec.ts, spec маппинга ошибок портала (дописать). Реализация: domain/product-access.ts, errors.ts, interface/portal-error-status.ts
- [x] 1.4 Порты `AgentGuideRepository` (`upsert`, `delete`), `AgentGuideQuery` (`find` → `GuideRecord | null`), `ProductAccessRepository` (`lockProduct`, `replace`, `findProductWithDepartments`), `DepartmentLookupPort` (`findExistingIds`), `CatalogQuery.loadProductDepartments` и тип `DepartmentRef`. Без тестов: интерфейсы; готово, когда typecheck проходит

## 2. portal (backend), Slonik-адаптеры
> track: backend
> depends: 1
> specs: featurer-agent-guides → «Чтение инструкции агента»; featurer-agent-guides → «Правка инструкции разработчиком»; featurer-agent-guides → «Инструкция при архивации агента»; featurer-catalog → «Отделы, которым доступен продукт»; featurer-catalog → «Назначение отделов продукту»
> arch: Services/AgentGuideRepository; Services/AgentGuideQuery; Services/ProductAccessRepository; Services/DepartmentLookupPort; Services/CatalogQuery
> files: backend/src/modules/portal/infrastructure/slonik-agent-guide.repository.ts; slonik-agent-guide.query.ts; slonik-product-access.repository.ts; slonik-department-lookup.ts; slonik-catalog.query.ts (+ *.spec.ts)
> frames: —
> БД для DB-тестов: локальный PostgreSQL на 5432 (Docker на 5433 не нужен). Запуск: `PROGRAMS_ETL_TEST_ADMIN_URL=<POSTGRES_URL из backend/.env с базой /postgres> npx vitest run <путь>`. Пропуск DB-тестов из-за «БД недоступна» не принимается, пока эта команда не попробована.

- [x] 2.1 TDD: `SlonikAgentGuideRepository` (`INSERT … ON CONFLICT (agent_id) DO UPDATE`, `delete` без строки — не ошибка) и `SlonikAgentGuideQuery` (автор с ФИО через `auth_user_profiles`, без ФИО — логин). Тесты: infrastructure/slonik-agent-guide.spec.ts. Реализация: slonik-agent-guide.repository.ts, slonik-agent-guide.query.ts
- [x] 2.2 TDD: `SlonikProductAccessRepository` — `lockProduct` (`FOR UPDATE`, некорректный UUID → `null`), `replace` (`DELETE` + `INSERT … unnest`, FK `23503` → `DepartmentNotFoundError`), `findProductWithDepartments` (отделы по `lower(name), id`); `SlonikDepartmentLookup.findExistingIds`. Тесты: infrastructure/slonik-product-access.spec.ts. Реализация: slonik-product-access.repository.ts, slonik-department-lookup.ts
- [x] 2.3 TDD: `SlonikCatalogQuery.loadProductDepartments` — все пары продукт–отдел с названием, `ORDER BY lower(name), id`; удалённый отдел пропадает каскадом. Тесты: infrastructure/slonik-catalog.query.spec.ts (дописать). Реализация: infrastructure/slonik-catalog.query.ts

## 3. portal (backend), use-case'ы
> track: backend
> depends: 1
> specs: featurer-agent-guides → «Чтение инструкции агента»; featurer-agent-guides → «Правка инструкции разработчиком»; featurer-agent-guides → «Инструкция при архивации агента»; featurer-catalog → «Отделы, которым доступен продукт»; featurer-catalog → «Назначение отделов продукту»
> arch: Services/GetAgentGuideUseCase; Services/SaveAgentGuideUseCase; Services/SetProductDepartmentsUseCase; Services/GetCatalogUseCase
> files: backend/src/modules/portal/application/get-agent-guide.use-case.ts; save-agent-guide.use-case.ts; guide-view.ts; set-product-departments.use-case.ts; get-catalog.use-case.ts; test-doubles.ts (+ *.spec.ts)
> frames: —

- [x] 3.1 TDD: `GetAgentGuideUseCase` (агент не найден или в архиве → 404; нет инструкции → пустой `GuideView`) и `SaveAgentGuideUseCase` (в транзакции `findAgentForShare`: нет → 404, архив → 409; `GuideBody.of` → `upsert` или `delete`; после коммита — `find`). Тесты: application/agent-guide.use-cases.spec.ts. Реализация: get-agent-guide.use-case.ts, save-agent-guide.use-case.ts, guide-view.ts
- [x] 3.2 TDD: `SetProductDepartmentsUseCase` — `lockProduct` (нет → `ProductNotFoundError`), не все отделы найдены → `DepartmentNotFoundError` без `replace`, пустой список очищает набор, повторы схлопнуты. Тесты: application/set-product-departments.use-case.spec.ts. Реализация: set-product-departments.use-case.ts
- [x] 3.3 TDD: `GetCatalogUseCase` раскладывает `loadProductDepartments` в `departments` продукта и продуктов каждого агента (`CatalogProductRef`), пустой список у продукта без отделов. Тесты: application/get-catalog.use-case.spec.ts (дописать). Реализация: application/get-catalog.use-case.ts

## 4. portal (backend), HTTP и регистрация
> track: backend
> depends: 2, 3
> specs: featurer-agent-guides → «Чтение инструкции агента»; featurer-agent-guides → «Правка инструкции разработчиком»; featurer-catalog → «Назначение отделов продукту»; featurer-catalog → «Отделы, которым доступен продукт»
> arch: Services/GuidesController; Services/CatalogController
> files: backend/src/modules/portal/interface/http/guides.controller.ts; guides.schemas.ts; guides.responses.ts; catalog.controller.ts; catalog.schemas.ts; catalog.responses.ts (+ *.spec.ts); backend/src/modules/portal/portal.module.ts
> frames: —

- [x] 4.1 TDD: `GuidesController` — `GET /portal/agents/:id/guide` (любой вошедший, 401 без токена), `PUT` (`@Roles('developer')`, 403 сотруднику, тело `{ body: string ≤ 200000 }`), ответ `GuideResponse`. Тесты: interface/http/guides.controller.spec.ts (http-fixture). Реализация: guides.controller.ts, guides.schemas.ts, guides.responses.ts
- [x] 4.2 TDD: `PUT /portal/products/:id/departments` (`@Roles('admin')`, 403 разработчику без `admin`, `departmentIds` — строки 1–100 символов, не UUID, не больше 100 → иначе 400), ответ `{ id, slug, name, departments }`; `departments` в ответе каталога у продукта и у продуктов агента. Тесты: interface/http/catalog.controller.spec.ts (дописать). Реализация: catalog.controller.ts, catalog.schemas.ts, catalog.responses.ts
- [x] 4.3 Регистрация контроллера, трёх use-case'ов и четырёх адаптеров в `portal.module.ts`. Проверка: typecheck и тесты модуля портала green

## 5. portal (frontend), общий компонент `Markdown`
> track: portal
> depends: —
> specs: featurer-catalog-ui → «Инструкция в карточке агента»
> arch: UI-компоненты/Markdown
> files: portal/package.json; portal/package-lock.json; portal/src/components/ui/markdown.tsx; portal/src/components/ui/markdown.test.tsx
> frames: wGn7t

- [x] 5.1 Установить `react-markdown` и `remark-gfm` в `portal` (`npm install`). Без тестов: зависимость; проверка — `npm run typecheck`
- [x] 5.2 TDD: `Markdown` — заголовки, списки, ссылки, код, таблицы, цитаты, изображения; `<script>` и `<b>` видны как текст и не исполняются; `urlTransform` пропускает только `http`, `https`, `mailto` и относительные, ссылка с пустым `href` рендерится `<span>`; внешние ссылки `target="_blank" rel="noopener noreferrer"`; блоки кода `font-mono` (ui-design «Отклонения» п. 2), стили токенами. Тесты: components/ui/markdown.test.tsx. Вёрстка по фрейму `wGn7t`, сверка с макетом в этой же задаче

## 6. portal (frontend), фича `guides`: модель
> track: portal
> depends: —
> specs: featurer-catalog-ui → «Инструкция в карточке агента»; featurer-catalog-ui → «Редактор инструкции»
> arch: Features/guides; Hooks/agentGuideQuery; Hooks/useSaveGuide
> files: portal/src/features/guides/model/**; portal/src/features/guides/index.ts; portal/src/lib/query-keys.ts
> frames: —

- [x] 6.1 TDD: Zod-схема `GuideResponse` (пустая инструкция — все поля `null`) по контракту design.md §3, фикстуры, `guides.api.ts` (`getAgentGuide`, `saveAgentGuide`), `agentGuideQuery`, `useSaveGuide` (успех кладёт ответ в кеш), `guides.errors.ts` (409 «Агент в архиве», 400, сеть); `GUIDES_KEY`. Тесты: features/guides/model/guides.test.tsx. Реализация: model/guides.schema.ts, guides.api.ts, guides.queries.ts, use-save-guide.ts, guides.errors.ts, guides.fixtures.ts

## 7. portal (frontend), блок «Инструкция» в карточке агента
> track: portal
> depends: 5, 6
> specs: featurer-catalog-ui → «Инструкция в карточке агента»; featurer-catalog-ui → «Редактор инструкции»
> arch: UI-компоненты/AgentGuideSection; UI-компоненты/GuideView; UI-компоненты/GuideEditor; UI-компоненты/AgentCard; Pages/AgentPage
> files: portal/src/features/guides/ui/** (+ *.test.tsx); portal/src/features/catalog/ui/AgentCard.tsx; portal/src/pages/AgentPage.tsx; AgentPage.test.tsx
> frames: Evo3D; uJtZy; tf2o7; Y4SlRl; D4Q0f; f3gPbE; qoSjS; EKgBv; WLnTc; GvYMF; WA7PS; intnO; w0OMuK; m5Pjt; Y8ku0

- [x] 7.1 TDD: `AgentGuideSection` и `GuideView` — скелет только при первой загрузке, ошибка с «Повторить», «Инструкции пока нет», просмотр через `Markdown` с подписью «Изменено {дата} · {имя}», текст ограничен шириной 760 на 1440 (ui-design «Отклонения» п. 3); «Изменить» / «Написать инструкцию» только при `canEdit`. Тесты: features/guides/ui/AgentGuideSection.test.tsx. Вёрстка по фреймам `Evo3D`, `uJtZy`, `tf2o7`, `Y4SlRl`, `w0OMuK`, `m5Pjt`, `Y8ku0`
- [x] 7.2 TDD: `GuideEditor` — вкладки «Текст» / «Просмотр», моноширинное поле, счётчик «N / 50 000» виден всегда и краснеет после предела (п. 4), сохранение недоступно сверх предела и во время запроса, пустой текст → `ConfirmDialog` «Удалить инструкцию?», «Отмена» с изменениями → подтверждение, ошибка и 409 сохраняют текст. Тесты: ui/GuideEditor.test.tsx. Вёрстка по фреймам `D4Q0f`, `f3gPbE`, `qoSjS`, `EKgBv`, `WLnTc`, `GvYMF`, `WA7PS`, `intnO`
- [x] 7.3 TDD: `AgentCard` получает слот `guide` над навыками; `AgentPage` передаёт `<AgentGuideSection agentId canEdit={isDeveloper} />`, «Сообщить о проблеме» из Э5 остаётся в `actions`; ошибка инструкции не скрывает навыки. Тесты: pages/AgentPage.test.tsx. Вёрстка по фреймам `Evo3D`, `tf2o7`

## 8. portal (frontend), доступность продукта в каталоге
> track: portal
> depends: —
> specs: featurer-catalog-ui → «Доступность продукта в каталоге»; featurer-catalog-ui → «Доступ отделов для администратора»
> arch: Features/catalog; UI-компоненты/ProductAccessLabel; UI-компоненты/ProductAccessDialog; UI-компоненты/CatalogList; UI-компоненты/AgentCard; Hooks/useSetProductDepartments; Pages/CatalogPage
> files: portal/src/features/catalog/model/catalog.api.ts; catalog.fixtures.ts; use-set-product-departments.ts; catalog.test.ts; portal/src/features/catalog/ui/ProductAccessLabel.tsx; ProductAccessDialog.tsx; CatalogList.tsx; AgentCard.tsx (+ *.test.tsx); portal/src/features/catalog/index.ts; portal/src/pages/CatalogPage.tsx; CatalogPage.test.tsx
> frames: H4AXRZ; crZY6; tCwah; vMkYQ; Z6nLQ; jWqgb; WFG1L; Z48o0

- [x] 8.1 TDD: схема каталога — `departments: { id, name }[]` у продукта и у продуктов агента; `ProductAccessLabel` («Доступно: …», ничего при пустом списке, перенос на 360); подпись под продуктом в `CatalogList` и у каждого продукта в `AgentCard`, продукты агента — по одному в строке (ui-design «Отклонения» п. 1). Тесты: model/catalog.test.ts, ui/ProductAccessLabel.test.tsx. Вёрстка по фреймам `H4AXRZ`, `crZY6`, `vMkYQ`
- [x] 8.2 TDD: `useSetProductDepartments` (успех инвалидирует каталог, 404 — каталог и отделы) и `ProductAccessDialog` — чекбоксы по названию, «Выбрано N из M» (п. 5), сохранение недоступно во время запроса, ошибка сохраняет отметки, 404 — сообщение, пустой справочник — подсказка, ссылка на «Отделы» и одна кнопка «Закрыть» (п. 7). Тесты: ui/ProductAccessDialog.test.tsx. Вёрстка по фреймам `Z6nLQ`, `jWqgb`, `WFG1L`, `Z48o0`
- [x] 8.3 TDD: `CatalogList` принимает `productAction?: (product) => ReactNode`; `CatalogPage` для `admin` грузит отделы через `pages/use-departments.ts` и передаёт кнопку «Доступ отделов» с диалогом; у пользователя без `admin` действия нет и отделы не запрашиваются. Тесты: pages/CatalogPage.test.tsx. Вёрстка по фрейму `tCwah`

## 9. Интеграционная проверка и документация
> track: integration
> depends: 4, 7, 8
> БД для DB-тестов: локальный PostgreSQL на 5432 (Docker на 5433 не нужен). Запуск: `PROGRAMS_ETL_TEST_ADMIN_URL=<POSTGRES_URL из backend/.env с базой /postgres> npx vitest run <путь>`. Пропуск DB-тестов из-за «БД недоступна» не принимается, пока эта команда не попробована.

- [x] 9.1 Контракт фронт-бэк: Zod-схемы портала разбирают реальные `guides.responses.ts`, ответ `PUT …/departments` и каталог с `departments`; расхождений нет
- [x] 9.2 Миграция 038 на локальной БД после 037: применяется и откатывается; удаление пустого отдела через `DELETE /admin/departments/:id` убирает его из пометок продуктов. Если БД недоступна — зафиксировать в итоге
- [x] 9.3 Сквозной сценарий в браузере (Playwright MCP): разработчик пишет инструкцию с заголовком, списком, таблицей и `<script>` → сотрудник видит оформленный текст, скрипт как текст; администратор назначает manager-helper отделы «КЦ 1» и «КЦ 2» → сотрудник видит «Доступно: КЦ 1, КЦ 2» в каталоге и карточке агента. Один скриншот карточки агента
- [x] 9.4 Документация: эндпоинты инструкции и доступа в документации модуля портала; обновить «Текущее состояние кода» в `FEATURER_ROADMAP.md`

## 10. Code review
> track: review
> depends: 1, 2, 3, 4, 5, 6, 7, 8, 9

- [x] 10.1 Code review всех изменений change от base commit по измерениям: соответствие specs/design, стандарты проекта, корректность (выполняет фаза Review workflow `apply-openspec-change`)
- [x] 10.2 Исправить blocking и major (дефекты поведения — через тест, воспроизводящий ошибку), не больше 2 раундов ревью; оставшиеся minor перечислить в итоге; регрессия зелёная
