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
- `src/config` — валидация env через Zod
- `src/database` — Slonik-пул для PG, репозитории и мигратор (`db/migrations/*.sql`, применяются при старте)
- `src/mssql` — Prisma-клиент для MSSQL (adapter `mssql`)
- `src/queue` — BullMQ-очередь `audit`, контроллер и процессор
- `src/agent` — граф LangGraph и сервис
- `src/logger` — pino → stdout (+ Loki, если задан `LOKI_URL`)
- `src/metrics`, `src/health` — `/metrics`, `/health`
# synergy
