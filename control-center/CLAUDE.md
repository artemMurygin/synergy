# control-center (Electron)

Стек: electron-vite, React, TanStack Query/Table, Zustand, Zod, assistant-ui (AG-UI), socket.io-client, Tailwind.

## Структура `src/`

- `main/` — main-процесс: `auth/`, `notifications/`, `portal/`, протокол `cc-api://` (`cc-api-protocol.ts`) — проксирует запросы рендерера к бэкенду, `backend-config.ts`.
- `preload/` — мост между main и renderer.
- `renderer/src/` — UI: `App.tsx`, `features/`, `components/`, `layouts/`, `lib/`, `stores/`, `index.css` (токены).

## UI Kit

Вид — из `@synergy/ui-kit` (см. `ui-kit/CLAUDE.md`, `.claude/rules/ui-kit.md`); shadcn `components/ui/*` и тёмной темы нет. В `index.css`: `@import '@synergy/ui-kit/styles.css'` и `@source '../../../../ui-kit/src'`. Контейнеры над пакетом:
- `layouts/AppShell.tsx` — AppFrame, NavRail, ProfileMenu, уведомления, `LayoutModeProvider mode="desktop"`; `layouts/ChatLayout.tsx`;
- `features/tasks/TasksPage.tsx`, `features/auth/AuthGate.tsx`;
- `features/chat/use-file-upload-port.ts` — `FileUploadPort` поверх `lib/backend/xhr-upload`.
Запросы, store, IPC остаются здесь; секция — `ui.store.section`.

## Тесты и проверка

- `npx vitest run <путь>` во время работы, `npm run typecheck` (node + web), полный `npm test` в конце.
- Проверка UI — по `.claude/rules/frontend-ui-verification.md` (MCP `electron-stagewright`). Макеты — фрейм Control Center в `design/synergy-design.pen`.
