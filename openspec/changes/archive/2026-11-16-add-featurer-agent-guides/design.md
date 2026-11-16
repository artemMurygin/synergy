## Context

Мотивация — в proposal.md (Why), требования — в `specs/`. Ниже только то, что влияет на реализацию.

- Change идёт после `add-featurer-bug-reports` (Э5): последняя миграция там — 037, в слоте `actions` карточки агента уже есть «Сообщить о проблеме» и `ArchiveAgentAction`.
- Каталог: `portal_products`, `portal_agents` (`archived_at`), `portal_agent_products`. `CatalogRepository.findAgentForShare(id)` возвращает агента с `archivedAt` и `productIds`, `findProductsByIds(ids)` — продукты. `GetCatalogUseCase` собирает дерево из плоских строк `CatalogQuery.loadVisible()`. Ответ продукта в каталоге — `{ id, slug, name, agents }`, продукты агента — `ProductRef { id, name }` (используется также в `/portal/skills` и `/portal/agents`).
- Справочник отделов живёт в модуле `auth`: таблица `auth_departments (id TEXT PK, name)`, admin-API `GET /admin/departments` (`@Roles('admin')`). Идентификаторы отделов текстовые (известное расхождение Э1: admin-API местами ждёт UUID). Отдел без сотрудников удаляется `DELETE /admin/departments/:id`.
- Read-модели `portal` уже читают таблицы `auth_*` через SQL JOIN (ФИО из `auth_user_profiles`). Межмодульный импорт доменного кода `auth` в `portal` не принят.
- Портал: `AgentPage` берёт агента из `useCatalog()` + `selectAgent`, рендерит `AgentCard` со слотом `actions`. `CatalogPage` рендерит `CatalogList`. Фичи `catalog` и `departments` друг друга не импортируют. Markdown-библиотек в портале нет.

## Goals / Non-Goals

**Goals:**
- Инструкция — отдельная запись при агенте, не поле агента: агент не меняется, а инструкция не участвует в архивации и сидере.
- Пометка доступности — данные каталога, которые читает любой и меняет только `admin`; права нигде не проверяются по отделу.
- Безопасный показ markdown без `dangerouslySetInnerHTML` и без своих санитайзеров.

**Non-Goals:**
- История версий, черновики, совместное редактирование и блокировки.
- Загрузка картинок и файлов в инструкцию.
- Инструкции к продуктам и навыкам, поиск по инструкциям.
- Ограничение видимости по отделу; правка отделов в разделе «Отделы».
- Уведомления о правке инструкции или доступа.

## Decisions

### 1. Хранение — миграция 038

```
portal_agent_guides (
  agent_id    UUID PRIMARY KEY REFERENCES portal_agents(id),
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 50000),
  updated_by  UUID NOT NULL REFERENCES auth_users(id),
  updated_at  TIMESTAMPTZ NOT NULL
)

portal_product_departments (
  product_id     UUID NOT NULL REFERENCES portal_products(id),
  department_id  TEXT NOT NULL REFERENCES auth_departments(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, department_id)
)
INDEX portal_product_departments_department_idx ON (department_id)
```

- `ON DELETE CASCADE` на отдел реализует «удаление отдела убирает его из пометок» без правок в модуле `auth`.
- Пустая инструкция не хранится: строки нет. Так «нет инструкции» — одно состояние, а не два (`NULL` и пустая строка).
- *Почему не колонка `guide` в `portal_agents`:* правка инструкции не должна конфликтовать с архивацией агента (`SELECT … FOR UPDATE` агента), а автор и время правки — данные инструкции, а не агента.

### 2. Домен инструкции

- `GuideBody` (`domain/guide-body.ts`): `GuideBody.of(raw): GuideBody | null` — trim по краям, пусто → `null` (удаление), `> MAX_GUIDE_LENGTH = 50000` → `ArgumentInvalidError` (400). Длина проверяется после trim.
- `AgentGuide` (`domain/agent-guide.ts`): `{ agentId, body: GuideBody, updatedBy, updatedAt }`, `write({ agentId, body, by, now })`. Агрегата с инвариантами сверх VO нет, поэтому это простой объект-значение записи.
- Предусловие «агент существует и не в архиве» проверяет use-case через `findAgentForShare` (`FOR SHARE` держит агента от архивации до коммита). Чтение: агент не найден или в архиве → `AgentNotFoundError` (404). Запись: не найден → 404, в архиве → `AgentArchivedError` (409).

### 3. Use-case'ы и API инструкции

| Метод | Use-case | Роль | Ответ |
|---|---|---|---|
| `GET /portal/agents/:id/guide` | `GetAgentGuideUseCase` | любой | 200 `GuideResponse` |
| `PUT /portal/agents/:id/guide` `{ body }` | `SaveAgentGuideUseCase` | `developer` | 200 `GuideResponse` |

```
GuideResponse = { body: string | null, updatedAt: string | null, updatedBy: { id, login, fullName } | null }
```

- `SaveAgentGuideUseCase`, в транзакции: `findAgentForShare` → `GuideBody.of` → `null` ? `AgentGuideRepository.delete(agentId)` : `upsert(AgentGuide.write(...))` (`INSERT … ON CONFLICT (agent_id) DO UPDATE`). Последняя запись побеждает, ошибок гонки нет. После коммита — `AgentGuideQuery.find(agentId)` с ФИО через JOIN `auth_user_profiles`.
- Zod: `{ body: z.string().max(200000) }` — грубая защита от огромного тела до trim; предел 50 000 — в VO.
- Некорректный UUID в пути → `findAgentForShare` возвращает `null` → 404, как в остальных эндпоинтах агента.
- *Почему `PUT` целиком, а не `PATCH`:* документ один и маленький, частичных правок нет.

### 4. Доступность продукта

- `ProductAccess` (`domain/product-access.ts`): `ProductAccess.of(productId, departmentIds)` — схлопывает повторы, сохраняет набор. Предел числа отделов `MAX_PRODUCT_DEPARTMENTS = 100` — в Zod-схеме (400).
- Порт `DepartmentLookupPort` (`domain/ports/department-lookup.port.ts`): `findExistingIds(ids): Promise<string[]>`. Адаптер `SlonikDepartmentLookup` читает `auth_departments`. Порт в `portal`, а не вызов use-case'а `auth`: нужен один `SELECT id … WHERE id = ANY($1)`, по образцу чтения `auth_user_profiles` в read-моделях.
- `SetProductDepartmentsUseCase`, в транзакции: `ProductAccessRepository.lockProduct(productId)` (`SELECT … FOR UPDATE`, нет → `ProductNotFoundError` 404; сериализует двух администраторов) → `findExistingIds`; если найдено меньше уникальных id → `DepartmentNotFoundError` (`PORTAL_DEPARTMENT_NOT_FOUND` → 404) → `replace(access)` (`DELETE` + `INSERT … SELECT unnest`). Если отдел удалён между проверкой и вставкой, нарушение внешнего ключа `23503` адаптер превращает в `DepartmentNotFoundError`.
- `PUT /portal/products/:id/departments` `{ departmentIds: string[] }`, `@Roles('admin')`, ответ 200 `{ id, slug, name, departments: { id, name }[] }`. Идентификаторы отделов — `z.string().trim().min(1).max(100)`, не UUID (решение Э1 о текстовых id).
- Каталог: `CatalogQuery.loadProductDepartments(): Promise<ProductDepartmentRow[]>` (`product_id, department_id, name`, `ORDER BY lower(name), id`) — отдельный запрос, плоский запрос дерева не меняется. `GetCatalogUseCase` раскладывает отделы по продуктам: в `CatalogProductView.departments` и в `products` каждого агента (`CatalogProductRef = ProductRef & { departments }`). `ProductRef` в `/portal/skills` и `/portal/agents` не меняется.
- *Почему правит `admin`, а не `developer`:* по роадмапу администратор «ведёт людей и доступы», и только у него есть справочник отделов в портале. Разработчик ведёт навыки и инструкции.

### 5. Портал: фича `guides`

- `features/guides/`: `model/guides.api.ts` (`getAgentGuide`, `saveAgentGuide`), `guides.schema.ts`, `guides.queries.ts` (`agentGuideQuery(agentId)`), `use-save-guide.ts` (при успехе кладёт ответ в кеш), `guides.errors.ts` (409 → «Агент в архиве», 400, сеть). `ui/`: `AgentGuideSection` (корневой; props `agentId`, `canEdit`; режимы просмотра и правки — локальное состояние), `GuideView` (подпись автора и даты), `GuideEditor` (вкладки «Текст» / «Просмотр», счётчик, подтверждения удаления и отмены через `ConfirmDialog`).
- `components/ui/markdown.tsx` — общий `Markdown` на `react-markdown` + `remark-gfm`:
  - сырой HTML по умолчанию остаётся текстом (поведение `react-markdown` без `rehype-raw`), `skipHtml` не включается;
  - `urlTransform`: разрешены только `http`, `https`, `mailto` и относительные адреса, иначе `''`; компонент `a` с пустым `href` рендерит `<span>`; внешние ссылки — `target="_blank" rel="noopener noreferrer"`;
  - оформление элементов — классами на токенах (`text-ink`, `border-border`, `bg-surface-sunken`, `rounded-md`), без плагина typography.
  - *Почему не свой парсер и не `marked` + `DOMPurify`:* `react-markdown` строит React-элементы без `dangerouslySetInnerHTML`, безопасен по умолчанию и не требует отдельного санитайзера.
- `AgentPage` рендерит `<AgentGuideSection agentId={id} canEdit={isDeveloper} />` в новый слот `guide` у `AgentCard` (над навыками). Ошибка загрузки инструкции не скрывает карточку и навыки.

### 6. Портал: доступность в каталоге

- Схема каталога (`catalog.schema` / `catalog.api.ts`) получает `departments: { id, name }[]` у продукта и у продуктов агента.
- `features/catalog/ui/ProductAccessLabel` — «Доступно: КЦ 1, КЦ 2», ничего при пустом списке; используется в секции продукта `CatalogList` и в списке продуктов `AgentCard`.
- `features/catalog/ui/ProductAccessDialog` — чекбоксы (`Checkbox`) по переданному списку отделов, `model/use-set-product-departments.ts` (`PUT`, при успехе инвалидирует каталог). Список отделов фича `catalog` не грузит сама: `CatalogPage` для `admin` берёт его из существующего `pages/use-departments.ts` и передаёт в `CatalogList` пропом `productAction?: (product) => ReactNode`, который рисует кнопку и диалог. Так `catalog` не импортирует `departments`.
- Пустой справочник → подсказка и `Link` на `/admin/departments`. 404 при сохранении → сообщение и перезапрос отделов и каталога.

## Risks / Trade-offs

- [Инструкцию правят два разработчика одновременно, правка первого теряется] → разработчиков единицы, решение пользователя — без истории. Подпись «изменено … кем» видна сразу. Оптимистическая блокировка по `updatedAt` добавляется без смены API (`If-Match`), если понадобится.
- [Сотрудники примут пометку «Доступно: КЦ 1» за реальное ограничение] → подпись справочная, формулировка «Доступно» согласована; правило «отдел не влияет на права» явно в спеке `featurer-catalog`.
- [Новая зависимость `react-markdown` (+ `remark-gfm`) увеличивает бандл портала] → грузится только на карточке агента; при необходимости — `React.lazy` для `Markdown`.
- [Внешние картинки в инструкции раскрывают IP читателя стороннему хосту] → внутренний портал, картинки пишут разработчики. Если станет проблемой — запретить `img` через `disallowedElements`.
- [Чтение `auth_departments` из `portal` в обход модуля `auth`] → только чтение id и названий, как уже для `auth_user_profiles`; запись остаётся в `auth`.

## Migration Plan

1. Миграция 038 после 037 (Э5) создаёт две таблицы и индекс. Данных для переноса нет.
2. `npm install react-markdown remark-gfm` в `portal`.
3. Бэкенд и портал выкатываются вместе. Старый портал на новом бэкенде не ломается: новое поле `departments` в каталоге он игнорирует.
4. Откат: `DROP TABLE portal_product_departments; DROP TABLE portal_agent_guides;`.
