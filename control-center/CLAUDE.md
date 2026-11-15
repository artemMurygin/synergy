# control-center (Electron)

Стек: electron-vite, React, TanStack Query/Table, Zustand, Zod, assistant-ui (AG-UI), socket.io-client, Tailwind.

## Структура `src/`

- `main/` — main-процесс: `auth/`, `notifications/`, `portal/`, протокол `cc-api://` (`cc-api-protocol.ts`) — проксирует запросы рендерера к бэкенду, `backend-config.ts`.
- `preload/` — мост между main и renderer.
- `renderer/src/` — UI: `App.tsx`, `features/`, `components/`, `layouts/`, `lib/`, `stores/`, `index.css` (токены).

## Тесты и проверка

- `npx vitest run <путь>` во время работы, `npm run typecheck` (node + web), полный `npm test` в конце.
- Проверка UI — по `.claude/rules/frontend-ui-verification.md` (MCP `electron-stagewright`). Макеты — фрейм Control Center в `design/synergy-design.pen`.
