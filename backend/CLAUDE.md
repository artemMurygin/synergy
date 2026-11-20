# backend (NestJS, пакет `audit-agent`)

Код-стайл и логирование — `.claude/rules/code-style.md` и `.claude/rules/logging.md` (подключаются автоматически для `backend/src/**`).

## Структура

- `src/modules/<module>/` — модули по DDD/hexagonal:
  - `domain/` — сущности, value objects, ошибки домена (`errors.ts`), порты (`domain/ports/*.port.ts`); без зависимостей от NestJS и инфраструктуры.
  - `application/` — use cases (`*.use-case.ts`), test doubles для портов (`test-doubles.ts`).
  - `infrastructure/` — адаптеры портов (`slonik-*.repository.ts`, клиенты внешних API).
  - `interface/` — HTTP (`interface/http/*.controller.ts`, `*.schemas.ts` на Zod), маппинг ошибок в статусы (`*-error-status.ts`).
  - `<module>.module.ts`, токены DI — `<module>.tokens.ts`.
- `src/shared/` — общее: `ddd`, `errors`, `http`, `config` (`env.schema.ts` — все переменные окружения), `logger`, `queue`, `realtime`, `outbox`, `testing`, `people`, `client` (`ClientId` — клиент запроса, общий для `assistant` и `transcription`).
- `src/database/postgres` — Slonik-пул и мигратор; тесты миграций `*-migration.spec.ts`.
- `db/migrations/NNN_<name>.sql` — SQL-миграции, применяются при старте по порядку. Новый номер = последний + 1 (`ls db/migrations | tail -1`).

## Тесты

- Vitest, файлы `*.spec.ts` рядом с кодом. Один файл: `npx vitest run src/modules/auth/application/x.spec.ts`.
- Тесты с реальной БД (миграции, `postgres-*.repositories.spec.ts`) пропускаются без `PROGRAMS_ETL_TEST_ADMIN_URL`. Локально:
  - PostgreSQL поднят локально на `localhost:5432`. Admin URL — `POSTGRES_URL` из `backend/.env` с базой `/postgres` вместо рабочей;
  - запуск: `PROGRAMS_ETL_TEST_ADMIN_URL="$(grep '^POSTGRES_URL=' .env | cut -d= -f2- | sed -E 's#/[^/?]+(\?|$)#/postgres\1#')" npx vitest run <путь>`;
  - Docker (`npm run infra:up`, порт 5433) для тестов не нужен. Если база на 5432 не отвечает — не подбирай другие URL: верни, что DB-тесты не прогнаны.
- Порядок проверки: `npx vitest run <свои файлы>` → `npm run typecheck` → `npm run lint`; полный `npm test` — один раз в конце.

## Баги портала (`src/modules/portal`)

Сотрудник сообщает о проблеме агента, разработчик ведёт баг по статусам. Таблицы `portal_bugs`, `portal_bug_comments` (миграция 037; откат: `DROP TABLE portal_bug_comments; DROP TABLE portal_bugs;`).

- Статусы: `open`, `in_progress`, `resolved`, `wont_fix`. Переходы — `BUG_TRANSITIONS` в `domain/bug-status.ts`: open -> in_progress, wont_fix; in_progress -> resolved, wont_fix, open; resolved и wont_fix -> in_progress. `wont_fix` требует причину (1-2000 символов), при уходе из него причина очищается. Гонка смены статуса -> 409.
- Эндпоинты (префикс `/portal`): `POST /bugs`; `GET /bugs/my`; `GET /bugs/queue?status` (developer); `GET /bugs/:id` (автор или developer, чужой -> 404); `POST /bugs/:id/status` (developer); `GET|POST /bugs/:id/comments`; `PATCH /bugs/:id/comments/:commentId` (автор комментария, окно 15 минут). `my` и `queue` объявлены до `:id`.
- События: `portal.bug_reported`, `portal.bug_status_changed`, `portal.bug_comment_posted`; уведомления `bug.reported`, `bug.status-changed`, `bug.comment-added` (цель `bug`). Автору не шлются уведомления о собственных действиях.
- Контракт с порталом: `interface/http/bug-contract.spec.ts` (фикстуры в `portal/src/test/contract/bug-*.json`, обновление `UPDATE_CONTRACT=1`).

## Инструкции агентов и доступ продуктов (`src/modules/portal`)

Инструкция агента (Markdown) и справочная пометка «Доступно: отделы» у продукта. Таблицы `portal_agent_guides`, `portal_product_departments` (миграция 038; откат: `DROP TABLE portal_product_departments; DROP TABLE portal_agent_guides;`).

- Эндпоинты (префикс `/portal`): `GET /agents/:id/guide` (любой вошедший; архивный агент -> 404); `PUT /agents/:id/guide` `{ body }` (developer; trim, пусто -> удаление, >50000 -> 400, архив -> 409 `PORTAL_AGENT_ARCHIVED`); `PUT /products/:id/departments` `{ departmentIds }` (admin; замена набора целиком, id отделов текстовые, неизвестный отдел -> 404 `PORTAL_DEPARTMENT_NOT_FOUND`). `GET /catalog` отдаёт `departments` у продукта и у продуктов агента.
- Пометка справочная: права по отделу не проверяются. Удаление отдела каскадно (`ON DELETE CASCADE`) снимает пометки.
- Контракт с порталом: `interface/http/guides-contract.spec.ts` (фикстуры `portal/src/test/contract/{guide-responses,product-departments-response,catalog-departments-response}.json`, обновление `UPDATE_CONTRACT=1`).

## Прочее

- Переменные окружения — только через `src/shared/config/env.schema.ts` и `.env.example`.
- Сиды: `npm run seed:users`, `npm run seed:portal` (после первого старта, когда миграции применены).
