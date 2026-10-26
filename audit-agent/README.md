# audit-agent

NestJS + BullMQ/Redis + Zod + LangGraph. Основная БД — PostgreSQL через Slonik, внешняя БД — MSSQL через Prisma. Наблюдаемость: Prometheus, Loki, Grafana.

## Быстрый старт
```bash
cp .env.example .env
npm run infra:up          # postgres, mssql, redis, prometheus, loki, promtail, grafana
npm run prisma:pull       # интроспекция MSSQL в prisma/schema.prisma
npm run prisma:generate
npm run start:dev
```

- API: http://localhost:3000 (`POST /audits`, `GET /audits/:id`, `/health`, `/metrics`)
- Grafana: http://localhost:3001 (datasources Prometheus и Loki уже подключены)
- Prometheus: http://localhost:9090

## Структура
- `src/database` — подключения к БД: `postgres` (Slonik-пул и мигратор `db/migrations/*.sql`, применяются при старте), `mssql` (Prisma-клиент, adapter `mssql`, `generated/`)
- `src/shared` — сквозное: `config` (валидация env через Zod), `logger` (pino → stdout, + Loki при `LOKI_URL`), `metrics` (`/metrics`), `health` (`/health`), `http` (Zod-пайп и OpenAPI-хелпер)
- `src/modules/audit-agent` — модуль аудита по слоям DDD:
  - `domain` — сущность `AuditRun`, порты `AuditRunRepository` и `AuditAgent`, доменные ошибки
  - `application` — use case'ы (`CreateAudit`, `GetAudit`, `ProcessAudit`) и порт очереди `AuditQueue`
  - `infrastructure` — адаптеры: `persistence` (Postgres-репозиторий), `queue` (BullMQ), `agent` (граф LangGraph)
  - `interface` — входные адаптеры: `http` (контроллер аудитов), `queue` (BullMQ-процессор)
# synergy
