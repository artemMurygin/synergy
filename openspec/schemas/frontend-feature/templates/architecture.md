<!--
  Artifact: architecture (frontend)
  Requires: proposal, design
  Required by: ui-design, tasks (они не должны создаваться, пока этот файл не согласован с пользователем)

  Инструкция для агента:
  - Заполняй разделы на основе proposal.md и design.md текущего change.
  - Backend этой фичи реализуется отдельным change (schema backend-feature).
    Раздел "Backend Contract" ниже заполняй из его architecture.md ("API Contract")
    или из openspec/specs/ — не придумывай эндпоинты и поля. Если контракта ещё
    нет — останови работу и скажи об этом пользователю.
  - Не придумывай названия "на всякий случай" — только те страницы/фичи/компоненты,
    которые реально нужны для реализации фичи из proposal.md.
  - Для существующих модулей помечай статус как "existing", для новых — "new".
  - Перед заполнением сверься с frontend/CLAUDE.md (слои FSD, границы импортов,
    паттерны). Не изобретай структуру — переиспользуй существующие
    features/hooks/UI-кит, если подходящие уже есть. Новые UI-компоненты размещай
    только в shared/ui-kit/ (новый дизайн), не в shared/ui/ (легаси).
  - Диаграмма НЕ рисуется в markdown (mermaid): создай её на Miro-доске через
    Miro MCP и вставь в файл только ссылку (см. раздел Diagrams).
  - ОБЯЗАТЕЛЬНО: после заполнения всех разделов останови работу и явно спроси
    пользователя подтверждение по разделу "Confirmation Checklist" ниже.
    Не переходи к ui-design.md без явного "ок"/"согласен" от пользователя.
-->

# Architecture: {change-name}

## Scope
<!-- 1-2 предложения: какую часть фронтенда затрагивает это изменение -->

---

## Backend Contract
<!-- Что фронт потребляет. Источник: backend change (architecture.md → API Contract) или openspec/specs/ -->
Источник контракта: `<имя backend change или путь к spec>`

| Method | Path | Request | Response | Кто использует на фронте (hook / feature) |
|---|---|---|---|---|
| | | | | |

---

## Frontend — UI Model

<!--
  Проект использует Feature-Sliced Design (см. frontend/CLAUDE.md): app -> pages ->
  features -> kernel -> shared. Страница не может импортировать другую страницу,
  features не могут кросс-импортировать друг друга, shared ничего не импортирует.
  Внутри pages/<Page> и features/<Feature> — разделение на model/ (стейт, запросы)
  и ui/ (компоненты); публичный API фичи — только export через index.ts.
-->

### Pages
| Page | Route | Структура (ui / +model / +mediator) | Назначение |
|---|---|---|---|
| | | | |

### Features (переиспользуемые модули с бизнес-логикой)
| Feature | Статус (new/existing) | Публичный API (index.ts) | model/ (хуки, api.ts) | Назначение |
|---|---|---|---|---|
| | | | | |

### UI-компоненты (page-local и shared)
| Component | Слой (pages/<Page>/ui · shared/ui-kit · shared/ui legacy) | Props (основные) | Назначение |
|---|---|---|---|
| | | | |

### Hooks (model)
| Hook | Расположение | Тип (state-хук / query options factory) | Возвращает |
|---|---|---|---|
| | | | |

### Паттерны, которые нужно учесть при проектировании
<!-- Отметь, какие паттерны из frontend/CLAUDE.md применимы к этой фиче -->
- [ ] Публичный API фичи только через `index.ts` (реэкспорт корневого UI-компонента)
- [ ] Запросы к backend — через query options factory в `model/api.ts` (`queryOptions({...})`), не голыми async-функциями
- [ ] Ошибки API нормализуются через `ApiError` (`shared/errors/apiError.ts`) в `.catch()` запроса
- [ ] Для страницы с несколькими stateful-виджетами — `mediator/`-компонент без условного рендера
- [ ] Layout/контейнерные компоненты принимают именованные слоты (`header`/`body`/`footer`), а не `children`
- [ ] Разделение `isInitialLoad` / `isRefreshing` вместо одного `isLoading`, если фильтры не должны "схлопывать" уже отрисованные данные
- [ ] Новые компоненты — в `shared/ui-kit/` (новые токены), не в `shared/ui/` (легаси shadcn)

---

## Diagrams
<!--
  Диаграмма создаётся на Miro-доске через Miro MCP, а не в markdown.
  1. Найти/создать board для текущего change (board_search_boards, иначе board_create).
  2. Создать диаграмму на доске (canvas_create_from_svg / соответствующий диаграммный инструмент).
  3. Вставить ссылку на доску/элемент в поле "Miro link" ниже.
-->

### Frontend Data Flow
<!-- Page -> Feature/mediator -> model (hooks, query options) -> api.ts -> backend endpoint;
     где живёт стейт, где нормализуются ошибки (ApiError) -->
Miro link: `<ссылка на фрейм с диаграммой>`

---

## Confirmation Checklist
<!-- Агент: выведи этот список пользователю явным текстом перед завершением артефакта -->
- [ ] Backend Contract соответствует реально согласованному/реализованному backend
- [ ] Слои (pages/features/kernel/shared), структура model/ui и паттерны фронта согласованы
- [ ] Диаграмма data flow отражает ожидаемую реализацию
- [ ] Пользователь подтвердил переход к ui-design.md
