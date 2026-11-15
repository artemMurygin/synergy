# manager-helper (расширение Chrome)

Стек: Vite + CRX (`manifest.config.ts`), React, assistant-ui (AG-UI), socket.io-client, Zod.

## Структура `src/`

- `sidepanel/` — боковая панель (основной UI), `options/` — страница настроек, `background/` — service worker, `content/` — content scripts.
- `shared/` — клиенты API (`*-api.ts`), auth, notifications, настройки, общие стили (`styles.css`).

## Тесты и проверка

- `npx vitest run <путь>` во время работы, `npm run typecheck`, `npm run lint`, полный `npm test` в конце.
- Проверка UI — по `.claude/rules/frontend-ui-verification.md` (MCP `extension`, сначала `npx vite build`). Макеты — фрейм Manager Helper в `design/synergy-design.pen`.
