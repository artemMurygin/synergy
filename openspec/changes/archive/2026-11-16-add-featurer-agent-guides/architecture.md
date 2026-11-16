# Architecture: add-featurer-agent-guides

## Scope

Бэкенд-модуль `backend/src/modules/portal`: инструкция агента (VO, репозиторий, read-модель, два эндпоинта), набор отделов продукта (VO, порт справочника отделов, репозиторий, эндпоинт), отделы продукта в ответе каталога. Портал `portal/src`: новая фича `guides`, общий компонент `Markdown`, подпись доступности и диалог «Доступ отделов» в фиче `catalog`, слоты в `AgentPage` и `CatalogPage`.

---

## Backend — Domain Model

### Entities
| Name | Status (new/existing) | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `AgentGuide` (`portal/domain/agent-guide.ts`) | new | да (запись при агенте) | `agentId`, `body: GuideBody`, `updatedBy`, `updatedAt` | Текущая инструкция агента |
| `ProductAccess` (`portal/domain/product-access.ts`) | new | да (набор при продукте) | `productId`, `departmentIds: readonly string[]` (уникальные) | Справочная пометка доступности продукта |
| `Agent`, `Product` (existing, без изменений) | existing | да | `archivedAt` | Предусловия для инструкции и доступа |

### Aggregates
| Aggregate | Root entity | Входит в состав (entities/VO) | Инварианты, которые защищает |
|---|---|---|---|
| AgentGuide | `AgentGuide` | `GuideBody` | Текст непустой после trim и ≤ 50 000. Не больше одной инструкции на агента (PK `agent_id`). Пишется только для неархивного агента (проверка в use-case'е) |
| ProductAccess | `ProductAccess` | — | Отделы без повторов; все существуют в справочнике на момент записи; набор заменяется целиком |

### Value Objects
| Name | Поля | Почему VO (immutable/self-validating) |
|---|---|---|
| `GuideBody` (`portal/domain/guide-body.ts`, new) | `value: string` (trim по краям, 1–50 000); `of(raw)` → `GuideBody \| null` (пусто = удаление) | Одно правило длины и пустоты, 400 через `ArgumentInvalidError` |
| `DepartmentRef` (`portal/domain/ports/catalog-query.port.ts`, new тип) | `{ id: string, name: string }` | Отдел в ответах каталога |

### Services
| Service | Слой (application/domain/infrastructure) | Ответственность |
|---|---|---|
| `GetAgentGuideUseCase` (new, `portal/application/get-agent-guide.use-case.ts`) | application | `findAgent` (нет или архив → 404) → `AgentGuideQuery.find` |
| `SaveAgentGuideUseCase` (new, `portal/application/save-agent-guide.use-case.ts`) | application | Транзакция: `findAgentForShare` (404/409) → `GuideBody.of` → `upsert` или `delete`; после коммита `AgentGuideQuery.find` |
| `SetProductDepartmentsUseCase` (new, `portal/application/set-product-departments.use-case.ts`) | application | Транзакция: `lockProduct` (404) → `findExistingIds` (404) → `replace`; после коммита — продукт с отделами |
| `GetCatalogUseCase` (existing, меняется) | application | + `loadProductDepartments` → `departments` у продукта и у продуктов агента |
| `AgentGuideRepository` / `SlonikAgentGuideRepository` (new, `domain/ports/agent-guide-repository.port.ts`, `infrastructure/slonik-agent-guide.repository.ts`) | port / infrastructure | `upsert(guide)`, `delete(agentId)` |
| `AgentGuideQuery` / `SlonikAgentGuideQuery` (new, `domain/ports/agent-guide-query.port.ts`, `infrastructure/slonik-agent-guide.query.ts`) | port / infrastructure | Инструкция с автором (ФИО через JOIN `auth_user_profiles`) |
| `ProductAccessRepository` / `SlonikProductAccessRepository` (new, `domain/ports/product-access-repository.port.ts`, `infrastructure/slonik-product-access.repository.ts`) | port / infrastructure | `lockProduct(id): Product \| null`, `replace(access)`, `findProductWithDepartments(id)`; FK `23503` → `DepartmentNotFoundError` |
| `DepartmentLookupPort` / `SlonikDepartmentLookup` (new, `domain/ports/department-lookup.port.ts`, `infrastructure/slonik-department-lookup.ts`) | port / infrastructure | `findExistingIds(ids)` по `auth_departments` |
| `CatalogQuery` / `SlonikCatalogQuery` (existing, меняется) | port / infrastructure | + `loadProductDepartments()` |
| `GuidesController` (new, `interface/http/guides.controller.ts`) + `guides.schemas.ts`, `guides.responses.ts` | interface | `GET`/`PUT /portal/agents/:id/guide` |
| `CatalogController` (existing, меняется) + `catalog.schemas.ts`, `catalog.responses.ts` | interface | + `PUT /portal/products/:id/departments` (`@Roles('admin')`); `departments` в ответе каталога |

### Method Signatures (ключевые, по каждому сервису)
| Service.Method | Params | Returns | Краткое описание |
|---|---|---|---|
| `GuideBody.of` | `raw: string` | `GuideBody \| null` | Trim; пусто → `null`; > 50 000 → `ArgumentInvalidError` |
| `AgentGuide.write` | `{ agentId, body: GuideBody, by: string, now: Date }` | `AgentGuide` | Новая версия текста |
| `ProductAccess.of` | `productId: string, departmentIds: readonly string[]` | `ProductAccess` | Схлопывает повторы |
| `GetAgentGuideUseCase.execute` | `{ agentId }` | `GuideView` | 404 |
| `SaveAgentGuideUseCase.execute` | `{ agentId, actorId, body: string }` | `GuideView` | 400 / 404 / 409 |
| `SetProductDepartmentsUseCase.execute` | `{ productId, departmentIds: string[] }` | `ProductAccessView` | 404 (продукт или отдел) |
| `AgentGuideRepository.upsert` | `guide: AgentGuide` | `Promise<void>` | `INSERT … ON CONFLICT (agent_id) DO UPDATE` |
| `AgentGuideRepository.delete` | `agentId: string` | `Promise<void>` | Нет строки — не ошибка |
| `AgentGuideQuery.find` | `agentId: string` | `GuideRecord \| null` | `{ body, updatedAt, updatedBy: { id, login, fullName } }` |
| `ProductAccessRepository.lockProduct` | `productId: string` | `Promise<Product \| null>` | `FOR UPDATE`; некорректный UUID → `null` |
| `ProductAccessRepository.replace` | `access: ProductAccess` | `Promise<void>` | `DELETE` + `INSERT … unnest` |
| `ProductAccessRepository.findProductWithDepartments` | `productId` | `ProductAccessView` | `{ id, slug, name, departments: DepartmentRef[] }`, отделы по названию |
| `DepartmentLookupPort.findExistingIds` | `ids: readonly string[]` | `Promise<string[]>` | `SELECT id … WHERE id = ANY($1)` |
| `CatalogQuery.loadProductDepartments` | — | `Promise<ProductDepartmentRow[]>` | `{ productId, id, name }`, `ORDER BY lower(name), id` |

`GuideView` = `{ body: string \| null, updatedAt: Date \| null, updatedBy: Person \| null }` (`portal/application/guide-view.ts`; пустая инструкция — все поля `null`). `CatalogProductView` + `departments: DepartmentRef[]`, продукты агента в каталоге — `CatalogProductRef = ProductRef & { departments }`. Новая ошибка в `portal/domain/errors.ts`: `DepartmentNotFoundError` (`PORTAL_DEPARTMENT_NOT_FOUND` → 404), маппинг в `portal-error-status.ts`. Константы `MAX_GUIDE_LENGTH = 50000`, `MAX_PRODUCT_DEPARTMENTS = 100`. Миграция: `backend/db/migrations/038_portal_guides_product_access.sql`. Регистрация в `portal.module.ts` (контроллер, три use-case'а, четыре адаптера).

---

## Frontend — UI Model

### Pages
| Page | Route | Структура (ui / +model / +mediator) | Назначение |
|---|---|---|---|
| `AgentPage` (existing, меняется) | `/catalog/agents/:id` | ui + `use-catalog.ts` | Передаёт `<AgentGuideSection agentId canEdit={isDeveloper} />` в новый слот `guide` у `AgentCard`; действия Э5 и архивации — в `actions` |
| `CatalogPage` (existing, меняется) | `/catalog` | ui + `use-catalog.ts` + `use-departments.ts` (existing, только для `admin`) | Передаёт в `CatalogList` проп `productAction` с кнопкой и `ProductAccessDialog` для администратора |

### Features (переиспользуемые модули с бизнес-логикой)
| Feature | Статус (new/existing) | Публичный API (index.ts) | model/ (хуки, api.ts) | Назначение |
|---|---|---|---|---|
| `guides` | new | `AgentGuideSection` | `guides.api.ts` (`getAgentGuide`, `saveAgentGuide`), `guides.schema.ts`, `guides.queries.ts` (`agentGuideQuery`), `use-save-guide.ts`, `guides.errors.ts`, `guides.fixtures.ts` | Просмотр и правка инструкции |
| `catalog` | existing, меняется | + `ProductAccessLabel`, `ProductAccessDialog` | `catalog.api.ts`/схема (+ `departments`), `use-set-product-departments.ts` (new) | Подпись доступности, диалог «Доступ отделов» |

### UI-компоненты (page-local и shared)
| Component | Расположение (features/<f>/ui · components/ui · pages) | Props (основные) | Назначение |
|---|---|---|---|
| `Markdown` (new, общий) | `components/ui/markdown.tsx` | `children: string` | `react-markdown` + `remark-gfm`, `urlTransform` (http/https/mailto/относительные), `a` без `href` → `span`, внешние ссылки в новой вкладке, стили токенами |
| `AgentGuideSection` (new) | `features/guides/ui/AgentGuideSection.tsx` | `agentId: string`, `canEdit: boolean` | Заголовок «Инструкция», загрузка, ошибка с повтором, пусто, просмотр или редактор |
| `GuideView` (new, внутренний) | `features/guides/ui/GuideView.tsx` | `guide: AgentGuide` | `Markdown` + подпись «Изменено {дата} · {имя}» |
| `GuideEditor` (new, внутренний) | `features/guides/ui/GuideEditor.tsx` | `initialBody: string`, `agentId`, `onDone()` | Вкладки «Текст» / «Просмотр», `Textarea`, счётчик, «Сохранить» / «Отмена», подтверждения |
| `ProductAccessLabel` (new) | `features/catalog/ui/ProductAccessLabel.tsx` | `departments: DepartmentRef[]` | «Доступно: …» или ничего |
| `ProductAccessDialog` (new) | `features/catalog/ui/ProductAccessDialog.tsx` | `product: { id, name, departments }`, `departments: DepartmentOption[]`, `open`, `onClose` | Чекбоксы отделов, сохранение, пустой справочник |
| `AgentCard` (existing, меняется) | `features/catalog/ui/AgentCard.tsx` | + `guide?: ReactNode` | Слот над навыками; `ProductAccessLabel` у продуктов агента |
| `CatalogList` (existing, меняется) | `features/catalog/ui/CatalogList.tsx` | + `productAction?: (product) => ReactNode` | `ProductAccessLabel` под названием продукта, действие справа |
| `Button`, `Textarea`, `Checkbox`, `Dialog`, `ConfirmDialog`, `Alert` (existing) | `components/ui` | — | Переиспользуются |

### Hooks (model)
| Hook | Расположение | Тип (state-хук / query options factory) | Возвращает |
|---|---|---|---|
| `agentGuideQuery(agentId)` | `features/guides/model/guides.queries.ts` | query options factory | `[...GUIDES_KEY, agentId]` |
| `useSaveGuide(agentId)` | `features/guides/model/use-save-guide.ts` | мутация | При успехе кладёт ответ в кеш инструкции |
| `useSetProductDepartments()` | `features/catalog/model/use-set-product-departments.ts` | мутация | При успехе инвалидирует каталог; 404 → инвалидирует каталог и отделы |

`lib/query-keys.ts` — `GUIDES_KEY`. Зависимости портала: `react-markdown`, `remark-gfm`.

### Паттерны, которые нужно учесть при проектировании
- [x] Публичный API фичи только через `index.ts`: из `guides` — только `AgentGuideSection`
- [x] Запросы к backend — через query options factory, мутации — `use-*.ts`
- [x] Ошибки API нормализуются через `ApiError`, ветвление по `code`: `PORTAL_AGENT_ARCHIVED`, `PORTAL_AGENT_NOT_FOUND`, `PORTAL_DEPARTMENT_NOT_FOUND`, `PORTAL_PRODUCT_NOT_FOUND`
- [ ] `mediator/` не нужен: связь `catalog` и списка отделов — проп `productAction`, связь `catalog` и `guides` — слот `guide`
- [x] Именованные слоты: `AgentCard` — `actions` и `guide`; `CatalogList` — `productAction`
- [x] `isInitialLoad` / `isRefreshing`: инструкция показывает скелет только при первой загрузке
- [x] Новый общий компонент `Markdown` — в `components/ui/`, цвета — токенами

---

## Diagrams

Как и в прошлых change Featurer, диаграммы описаны текстом, в Miro не переносятся.

### 1. Domain Entity Interaction
`Agent 1—0..1 AgentGuide` (PK `agent_id`). `AgentGuide` содержит `GuideBody`, `updatedBy → auth_users`. `Product 1—1 ProductAccess` — набор строк `portal_product_departments`, `department_id → auth_departments` с `ON DELETE CASCADE`. Архивация агента инструкцию не трогает. Отделы не связаны с пользователями в этой модели и не участвуют в проверке прав.

### 2. External Modules Interaction
Портал → `GET`/`PUT /portal/agents/:id/guide`, `PUT /portal/products/:id/departments`, `GET /portal/catalog` (с `departments`). Портал (администратор) → `GET /admin/departments` модуля `auth` (существующий) для списка отделов в диалоге. `portal` → `auth` (guard, роли из access-токена). `portal` → таблица `auth_departments` только на чтение через `DepartmentLookupPort` и read-модель каталога. Удаление отдела в `auth` каскадно чистит `portal_product_departments` на уровне БД. Событий и уведомлений нет.

### 3. Layer Interaction — от Controller до Response
`GuidesController.save` (`@Roles('developer')`) → Zod (`{ body: string ≤ 200000 }`) → `SaveAgentGuideUseCase` → транзакция: `CatalogRepository.findAgentForShare` (нет → `AgentNotFoundError` 404, архив → `AgentArchivedError` 409) → `GuideBody.of` (400) → `null` ? `AgentGuideRepository.delete` : `upsert(AgentGuide.write)` → commit → `AgentGuideQuery.find` → 200 `GuideResponse`.

`GuidesController.get` → `GetAgentGuideUseCase` → `findAgent` (нет или архив → 404) → `AgentGuideQuery.find` → 200 (пустая инструкция при `null`).

`CatalogController.setProductDepartments` (`@Roles('admin')`) → Zod (`{ departmentIds: string[] ≤ 100 }`) → `SetProductDepartmentsUseCase` → транзакция: `ProductAccessRepository.lockProduct` (нет → `ProductNotFoundError` 404) → `ProductAccess.of` → `DepartmentLookupPort.findExistingIds` (не все → `DepartmentNotFoundError` 404) → `replace` (FK `23503` → 404) → commit → `findProductWithDepartments` → 200.

`CatalogController.catalog` → `GetCatalogUseCase` → `loadVisible` + `loadProductDepartments` → дерево с `departments` → 200.

---

## Confirmation Checklist
- [x] Названия entity/aggregate/VO согласованы
- [x] Названия и сигнатуры ключевых методов сервисов согласованы
- [x] Слои (pages/features/components), структура model/ui и паттерны фронта согласованы
- [x] Диаграммы взаимодействия: текстовое описание, как в прошлых change
- [x] Пользователь подтвердил переход к tasks.md
