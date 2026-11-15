# backend (NestJS, пакет `audit-agent`)

Код-стайл и логирование — `.claude/rules/code-style.md` и `.claude/rules/logging.md` (подключаются автоматически для `backend/src/**`).

## Структура

- `src/modules/<module>/` — модули по DDD/hexagonal:
  - `domain/` — сущности, value objects, ошибки домена (`errors.ts`), порты (`domain/ports/*.port.ts`); без зависимостей от NestJS и инфраструктуры.
  - `application/` — use cases (`*.use-case.ts`), test doubles для портов (`test-doubles.ts`).
  - `infrastructure/` — адаптеры портов (`slonik-*.repository.ts`, клиенты внешних API).
  - `interface/` — HTTP (`interface/http/*.controller.ts`, `*.schemas.ts` на Zod), маппинг ошибок в статусы (`*-error-status.ts`).
  - `<module>.module.ts`, токены DI — `<module>.tokens.ts`.
- `src/shared/` — общее: `ddd`, `errors`, `http`, `config` (`env.schema.ts` — все переменные окружения), `logger`, `queue`, `realtime`, `outbox`, `testing`, `people`.
- `src/database/postgres` — Slonik-пул и мигратор; тесты миграций `*-migration.spec.ts`.
- `db/migrations/NNN_<name>.sql` — SQL-миграции, применяются при старте по порядку. Новый номер = последний + 1 (`ls db/migrations | tail -1`).

## Тесты

- Vitest, файлы `*.spec.ts` рядом с кодом. Один файл: `npx vitest run src/modules/auth/application/x.spec.ts`.
- Тесты с реальной БД (миграции, `postgres-*.repositories.spec.ts`) пропускаются без `PROGRAMS_ETL_TEST_ADMIN_URL`. Локально:
  - PostgreSQL поднят локально на `localhost:5432`. Admin URL — `POSTGRES_URL` из `backend/.env` с базой `/postgres` вместо рабочей;
  - запуск: `PROGRAMS_ETL_TEST_ADMIN_URL="$(grep '^POSTGRES_URL=' .env | cut -d= -f2- | sed -E 's#/[^/?]+(\?|$)#/postgres\1#')" npx vitest run <путь>`;
  - Docker (`npm run infra:up`, порт 5433) для тестов не нужен. Если база на 5432 не отвечает — не подбирай другие URL: верни, что DB-тесты не прогнаны.
- Порядок проверки: `npx vitest run <свои файлы>` → `npm run typecheck` → `npm run lint`; полный `npm test` — один раз в конце.

## Прочее

- Переменные окружения — только через `src/shared/config/env.schema.ts` и `.env.example`.
- Сиды: `npm run seed:users`, `npm run seed:portal` (после первого старта, когда миграции применены).
