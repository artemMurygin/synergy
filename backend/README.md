# audit-agent

NestJS + BullMQ/Redis + Zod + LangChain. Основная БД — PostgreSQL через Slonik, внешняя БД — MSSQL через Prisma. Наблюдаемость: Prometheus, Loki, Grafana.

## Быстрый старт
```bash
cp .env.example .env
npm run infra:up          # postgres, mssql, redis, prometheus, loki, promtail, grafana
npm run prisma:pull       # интроспекция MSSQL в prisma/schema.prisma
npm run prisma:generate
npm run start:dev
```

- API: http://localhost:3000 (`/health`, `/metrics`)
- Grafana: http://localhost:3001 (datasources Prometheus и Loki уже подключены)
- Prometheus: http://localhost:9090

## Демо-сотрудники и Telegram
При `NODE_ENV` не production после миграций применяются сиды из `db/seeds` (демо-сотрудники, `ON CONFLICT DO NOTHING`). У сидовых сотрудников `telegram_chat_id` пуст, поэтому уведомления для них пропускаются (метрика `notifications_total{status="skipped"}`). Чтобы получать сообщения, сотрудник пишет боту, а chat id записывается вручную:
```sql
UPDATE employee SET telegram_chat_id = <chat_id> WHERE telegram_username = 'ivan_petrov';
```

## Известные ограничения
- Повторная постановка уведомления при ретрае аудита дедуплицируется jobId `notify-<dealId>-<updatedAt>-<username>`, пока задача хранится в Redis (последние 1000 завершённых).
- Задачи аудита не хранятся после завершения (`removeOnComplete`/`removeOnFail`), версии дедуплицируются по `deal_audit(deal_id, deal_updated_at)`.

## Структура
- `src/database` — подключения к БД: `postgres` (Slonik-пул и мигратор `db/migrations/*.sql`, применяются при старте), `mssql` (Prisma-клиент, adapter `mssql`, `generated/`)
- `src/shared` — сквозное: `config` (валидация env через Zod), `logger` (pino → stdout, + Loki при `LOKI_URL`), `metrics` (`/metrics`), `health` (`/health`), `http` (Zod-пайп и OpenAPI-хелпер)
- `src/modules/audit-agent` — модуль аудита сделок: `domain` (сущности, value objects, порты `*Port`), `application` (use case'ы), `infrastructure` (CRM, Postgres, BullMQ, Redis, Telegram, агент на `createAgent` из `langchain`), `interface/queue` (BullMQ-процессоры)
