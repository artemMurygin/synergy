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

## Авторизация (JWT)

Маршруты: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/change-password`, `GET /auth/me`. Access-токен передаётся в `Authorization: Bearer <accessToken>`. Refresh-токен по умолчанию лежит только в cookie `mh_refresh` (HttpOnly, SameSite=Strict, Path=/auth); при заголовке `X-Client-Type: desktop` он идёт в теле запроса, cookie не ставится.

### Переменные окружения
| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `JWT_SECRET` | нет, обязательна | Ключ подписи access-токена, минимум 32 символа. Без неё приложение не стартует |
| `AUTH_ACCESS_TTL` | `15m` | Срок жизни access-токена, формат `<число><s\|m\|h\|d>` |
| `AUTH_REFRESH_TTL` | `14d` | Срок жизни refresh-токена, тот же формат |
| `AUTH_REFRESH_GRACE_SECONDS` | `10` | Окно допуска повторного использования refresh-токена (`REFRESH_RACE` вместо отзыва сессии) |
| `AUTH_LOGIN_MAX_ATTEMPTS` | `5` | Число попыток входа в окне |
| `AUTH_LOGIN_WINDOW_MINUTES` | `15` | Длина окна лимита попыток |
| `AUTH_ALLOWED_ORIGINS` | пусто | Список допустимых Origin через запятую. Точный origin (`chrome-extension://<id>`) или шаблон схемы `chrome-extension://*`, который принимает любое расширение Chrome: ID настраивать не нужно, но защита cookie от CSRF слабее, так как расширение стороннего автора тоже пройдёт проверку |
| `TRUST_PROXY` | не задан | Express `trust proxy`: число прокси (`1`), `true` или подсети. Без него за reverse proxy `request.ip` равен адресу прокси, и лимит попыток входа по IP общий для всех |
| `AUTH_SEED_USERS` | не задана | JSON `[{"login":"ivan","password":"..."}]` для сидера (`password` необязателен) |

Для короткого теста истечения access поставьте, например, `AUTH_ACCESS_TTL=30s`.

### Миграция
`db/migrations/013_auth.sql` создаёт `auth_users`, `auth_sessions`, `auth_refresh_tokens` и применяется автоматически при старте, как остальные миграции.

### Сидер пользователей
```bash
AUTH_SEED_USERS='[{"login":"ivan"},{"login":"petr","password":"Temp-pass-1"}]' npm run seed:users
```
`npm run seed:users` собирает проект (`nest build`) и запускает `scripts/seed-users.mjs`. Для записи без `password` пароль генерируется и печатается в stdout один раз (строка `login<TAB>пароль`), в лог приложения он не попадает. Уже существующие логины пропускаются (`skipped: <login>`). Пользователь создаётся с признаком обязательной смены пароля: при первом входе расширение требует задать новый. Сидер нужно запускать после того, как миграция применена (приложение стартовало хотя бы раз). `password` необязателен и в схеме `env.schema.ts`, и в сидере.

### Порядок выката
1. Задать `JWT_SECRET` и `AUTH_ALLOWED_ORIGINS` (можно `chrome-extension://*`), развернуть бэкенд: миграция применится при старте.
2. Запустить `npm run seed:users` и передать временные пароли пользователям.
3. Выпустить расширение `manager-helper` с экраном входа. В настройках расширения адрес бэкенда должен быть доступен (для не-localhost расширение запросит разрешение на хост); для удалённого бэкенда используйте HTTPS.
4. Включить глобальный guard.

Состояние кода на момент написания: `AuthModule` (`src/modules/auth/auth.module.ts`), infrastructure/interface-слои и подключение в `AppModule` ещё не реализованы (группы 10-12 плана), поэтому `npm run seed:users` заработает только после них; порядок выката ниже описывает целевой процесс.

Примечание по состоянию кода: в `env.schema.ts` нет переменной-флага `AUTH_ENFORCED`, упомянутой в `design.md`. Пункт 4 и откат через конфигурацию описаны в плане change, но в коде на данный момент не реализованы. Перед выкатом проверьте, как включается guard в модуле авторизации.

### Откат
Отключить guard (способ см. примечание выше) и вернуть предыдущую версию расширения. Таблицы авторизации можно оставить: они не мешают остальной работе. Если нужно удалить их вручную: `DROP TABLE auth_refresh_tokens, auth_sessions, auth_users;`, а также запись о миграции `013_auth.sql` в таблице учёта миграций, иначе миграция не применится повторно.

## Задачи

Модуль `src/modules/tasks`: CRUD задач, наблюдатели, вложения. Все маршруты требуют Bearer-токен (глобальный `JwtAuthGuard`). Swagger: `/docs`, тег `tasks`.

| Метод и путь | Назначение |
| --- | --- |
| `POST /tasks`, `GET /tasks`, `GET /tasks/:id`, `PATCH /tasks/:id`, `DELETE /tasks/:id` | Создание, список с фильтрами и пагинацией, чтение, изменение, мягкое удаление |
| `POST /tasks/:id/attachments` | Загрузка файла (multipart, поле `file`) |
| `GET /tasks/:id/attachments/:attachmentId` | Скачивание файла |
| `DELETE /tasks/:id/attachments/:attachmentId` | Удаление вложения и файла |

### Переменные окружения

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `TASKS_STORAGE_DIR` | `./storage/tasks` | Каталог файлов вложений |
| `TASKS_MAX_FILE_SIZE_MB` | `20` | Максимальный размер одного файла, МБ (больше: 413) |
| `TASKS_MAX_FILES_PER_TASK` | `10` | Максимум вложений у одной задачи (больше: 422) |

### Хранилище файлов

Файлы лежат на диске в `TASKS_STORAGE_DIR` под случайными ключами, метаданные в таблице `task_attachment`. В продакшене каталог нужно монтировать на постоянный том и включать в бэкап вместе с базой: без файлов вложения в БД указывают в пустоту. Миграция `db/migrations/014_tasks.sql` применяется автоматически при старте.

## Известные ограничения
- Повторная постановка уведомления при ретрае аудита дедуплицируется jobId `notify-<dealId>-<updatedAt>-<username>`, пока задача хранится в Redis (последние 1000 завершённых).
- Задачи аудита не хранятся после завершения (`removeOnComplete`/`removeOnFail`), версии дедуплицируются по `deal_audit(deal_id, deal_updated_at)`.

## Структура
- `src/database` — подключения к БД: `postgres` (Slonik-пул и мигратор `db/migrations/*.sql`, применяются при старте), `mssql` (Prisma-клиент, adapter `mssql`, `generated/`)
- `src/shared` — сквозное: `config` (валидация env через Zod), `logger` (pino → stdout, + Loki при `LOKI_URL`), `metrics` (`/metrics`), `health` (`/health`), `http` (Zod-пайп и OpenAPI-хелпер)
- `src/modules/audit-agent` — модуль аудита сделок: `domain` (сущности, value objects, порты `*Port`), `application` (use case'ы), `infrastructure` (CRM, Postgres, BullMQ, Redis, Telegram, агент на `createAgent` из `langchain`), `interface/queue` (BullMQ-процессоры)
