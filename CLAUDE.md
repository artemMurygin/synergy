# Проекты СИНЕРГИЯ — монорепозиторий

Пиши и отвечай на русском. Идентификаторы и технические термины — как в коде.

## Состав

| Папка | Что это | Стек | Подробности |
|---|---|---|---|
| `backend/` | NestJS API (пакет `audit-agent`): модули агентов, auth, portal, tasks, files, notifications | NestJS, Slonik (PostgreSQL), Prisma (MSSQL), BullMQ, Redis, LangChain | `backend/CLAUDE.md` |
| `portal/` | Веб-портал (Vite SPA) | React, React Router, TanStack Query, Zustand, Zod, Tailwind 4 | `portal/CLAUDE.md` |
| `control-center/` | Десктоп-клиент | Electron (electron-vite), React, assistant-ui | `control-center/CLAUDE.md` |
| `manager-helper/` | Расширение Chrome (боковая панель) | Vite + CRX, React, assistant-ui | `manager-helper/CLAUDE.md` |
| `design/` | Макеты: `synergy-design.pen` (доски «Единый дизайн · 01–06» в режимах Desktop/Tablet/Mobile), `design-kit.lib.pen` (UI Kit: токены и мастера, имена токенов без `t:` = имена CSS-токенов кода) | Pencil | только через `mcp__pencil__*`, правила в `.claude/rules/design-system.md` |
| `openspec/` | Спеки и change'и, schema `end-to-end-feature-design` | OpenSpec | `openspec/config.yaml` |

Правила из `.claude/rules/` подключаются автоматически по путям файлов — не читай их вручную через `cat`.

## Команды (из папки пакета)

| Пакет | Тесты | Типы | Линт |
|---|---|---|---|
| backend | `npm test` / `npx vitest run <путь>` | `npm run typecheck` | `npm run lint` |
| portal | `npm test` / `npx vitest run <путь>` | `npm run typecheck` | — |
| control-center | `npm test` / `npx vitest run <путь>` | `npm run typecheck` | — |
| manager-helper | `npm test` / `npx vitest run <путь>` | `npm run typecheck` | `npm run lint` |

## Экономия контекста

- Тесты во время работы — только по своим файлам (`npx vitest run <путь>`); полный прогон — один раз в конце. Длинный вывод обрезай: `2>&1 | tail -40`.
- Не делай `ls -R` и `grep -rn` по всему репозиторию: структура описана в CLAUDE.md пакета, ищи точечно в нужном модуле.
- Не читай артефакты OpenSpec целиком, если задача требует только их части: ищи нужный раздел по заголовку.

## OpenSpec

- Новые фичи — через change в `openspec/changes/<name>/` (schema `end-to-end-feature-design`).
- Реализация change — только сохранённым workflow `apply-openspec-change` (`.claude/workflows/apply-openspec-change.js`), не новым скриптом.
