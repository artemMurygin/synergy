# portal (Vite SPA)

Стек: React, React Router, TanStack Query, Zustand, Zod, Tailwind 4 (`src/styles/index.css` — токены дизайна), Radix Slot + CVA.

## Структура `src/`

- `pages/<Name>Page.tsx` (+ `.test.tsx`) — страницы, маршруты в `router.tsx`, каркас в `layouts/AppLayout.tsx`.
- `features/<feature>/` — модули с бизнес-логикой:
  - `index.ts` — единственный публичный API фичи; снаружи импортируй только из него;
  - `model/` — `*.api.ts` (запросы), `*.queries.ts` (query options factory `queryOptions({...})`), `use-*.ts` (мутации/стейт), `*.schema.ts` (Zod), `*.errors.ts`, `*.fixtures.ts`;
  - `ui/` — компоненты фичи.
  - Фичи не импортируют друг друга; страница не импортирует другую страницу.
- `components/ui/` — UI Kit (button, badge, dialog, table, pagination, select, ...). Новые общие компоненты — сюда, по образцу существующих.
- `lib/` — `api-client.ts`, `errors.ts` (`ApiError` — нормализация ошибок API), `schemas/`, форматирование.
- `test/helpers.tsx` — рендер с провайдерами для тестов.

## Тесты и проверка

- Vitest + Testing Library, `*.test.ts(x)` рядом с кодом. Один файл: `npx vitest run src/features/employees/ui/EmployeeForm.test.tsx`.
- `npm run typecheck`; полный `npm test` — один раз в конце.
- Вёрстка — по макету в `design/synergy-design.pen` (фрейм Portal): Node ID указан в задаче, читай фрейм через `mcp__pencil__execute` (`Get`), а не по словесному описанию. Цвета, радиусы, отступы — токенами из `src/styles/index.css`, без хардкода.
- Проверка в браузере: `npm run dev`, Playwright MCP (`mcp__plugin_playwright_playwright__*`), один скриншот готового экрана.
