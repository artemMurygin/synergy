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

## Авторизация (JWT)

Маршруты: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/change-password`, `GET /auth/me`. Access-токен передаётся в `Authorization: Bearer <accessToken>`. Refresh-токен по умолчанию лежит только в cookie `mh_refresh` (HttpOnly, SameSite=Strict, Path=/auth); при заголовке `X-Client-Type: desktop` он идёт в теле запроса, cookie не ставится.

### Список пользователей

`GET /users` (Bearer-токен обязателен, Swagger: `/docs`, тег `users`) возвращает страницу активных пользователей для выбора ответственного и наблюдателей задач. Параметры: `search` (подстрока логина без учёта регистра, до 200 символов), `limit` (1..100, по умолчанию 20), `page` (с нуля). Ответ: `{ items: [{ id, login }], total, limit, page }`, сортировка по логину; отключённые пользователи не попадают в список, хэши и служебные поля не возвращаются. Некорректные параметры дают 400, отсутствие токена — 401.

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
| `AUTH_SEED_FILE` | не задана | Путь к JSON-файлу начальной загрузки `{departments, users}` (аргумент `--file` имеет приоритет над переменной) |
| `AUTH_SEED_USERS` | не задана | Прежний способ: JSON `[{"login":"ivan","password":"..."}]` (`password` необязателен). Вместе с `AUTH_SEED_FILE` не задаётся: это ошибка |

Для короткого теста истечения access поставьте, например, `AUTH_ACCESS_TTL=30s`.

### Миграция
`db/migrations/013_auth.sql` создаёт `auth_users`, `auth_sessions`, `auth_refresh_tokens` и применяется автоматически при старте, как остальные миграции.

### Начальная загрузка: отделы и сотрудники
```bash
cp db/seeds/users.example.json db/seeds/users.json   # реальный файл в git не попадает
npm run seed:users -- --file db/seeds/users.json     # или AUTH_SEED_FILE=db/seeds/users.json npm run seed:users
```
Формат файла (пример: `db/seeds/users.example.json`):
```json
{
  "departments": [{ "id": "dev", "name": "Разработка", "head": "ivan" }],
  "users": [
    {
      "login": "ivan", "lastName": "Иванов", "firstName": "Иван", "middleName": "Петрович",
      "departmentId": "dev", "position": "Тимлид", "email": "ivan@example.com",
      "scrmEmployeeId": "scrm-1", "password": "Temp-pass-1", "roles": ["admin"]
    }
  ]
}
```
Для отдела обязательны `id` (сохраняется как идентификатор) и `name`, `head` необязателен: это логин сотрудника из файла или уже существующего. Для сотрудника обязательны `login`, `lastName`, `firstName`; `password` и `roles` необязательны. Допустимые роли: `developer`, `admin`. Прежний массив `[{"login","password?","roles?"}]` (переменная `AUTH_SEED_USERS`) по-прежнему работает для записей без отделов и профиля.

Правила загрузки:
- Режим «только новые»: отдел (по `id`) или сотрудник (по логину), которые уже есть, пропускаются целиком (`skipped`), без изменения полей, ролей и пароля. Правки администратора повторная загрузка не затирает. Роли из файла применяются только вновь созданному сотруднику.
- Файл проверяется целиком до первой записи (неизвестный отдел или руководитель, неизвестная роль, дубли логина и email, конфликт email с существующим сотрудником, превышение длин). Любая ошибка прерывает загрузку, ничего не создаётся. Запись идёт одной транзакцией в порядке «отделы, сотрудники, руководители», поэтому руководитель может входить в свой же отдел. Хэши паролей считаются до транзакции.
- Сотруднику без `password` генерируется временный пароль: он печатается в stdout один раз (строка `login<TAB>пароль`), в лог не попадает; при первом входе требуется смена пароля.
- Отчёт: `department created|skipped: <id>`, `created: <login>` или `<login><TAB>пароль`, `skipped: <login>`.

`npm run seed:users` собирает проект (`nest build`) и запускает `scripts/seed-users.mjs`. Запускать после того, как миграции применены (приложение стартовало хотя бы раз).

Первый администратор: укажите `"roles": ["admin"]` у нового сотрудника в файле. Пока в системе нет активного администратора, раздел администрирования недоступен.

Выдать `admin` существующему пользователю (загрузка его пропустит) можно через SQL:
```sql
INSERT INTO auth_user_roles (user_id, role)
SELECT id, 'admin' FROM auth_users WHERE login = 'ivan'
ON CONFLICT DO NOTHING;
```
Роль попадает в access-токен при входе и обновлении сессии, поэтому вступает в силу не позднее чем через `AUTH_ACCESS_TTL`.

### Администрирование людей и отделов (admin-API)

Все маршруты требуют Bearer-токен с ролью `admin` (роль читается из access-токена, 403 без неё, 401 без токена). Swagger: `/docs`, теги `admin-employees` и `admin-departments`. Сброса пароля нет: временный пароль виден один раз при создании сотрудника.

| Метод и путь | Назначение |
| --- | --- |
| `GET /admin/employees` | Список: `search`, `departmentId`, `isActive`, `limit`, `page` (с нуля) |
| `GET /admin/employees/:id` | Карточка сотрудника |
| `POST /admin/employees` | Создание; ответ `{ employee, temporaryPassword }`, пароль отдаётся один раз, при первом входе требуется смена |
| `PATCH /admin/employees/:id` | Правка профиля (пропущенное поле не меняется, пустое очищает; логин неизменяем; конфликт email даёт ошибку) |
| `PUT /admin/employees/:id/roles` | Заменить набор ролей целиком (`developer`, `admin`; можно вместе) |
| `POST /admin/employees/:id/dismiss` | Увольнение: деактивация и отзыв всех refresh-сессий, идемпотентно |
| `POST /admin/employees/:id/restore` | Возврат уволенного, идемпотентно |
| `GET/POST /admin/departments`, `PATCH/DELETE /admin/departments/:id` | Справочник отделов: создание, переименование, смена `head`, удаление пустого отдела |

Отделы справочные: `head` лишь справочное поле и прав не даёт. Снять `admin` у единственного активного администратора нельзя (`LAST_ADMIN`). Отзыв или выдача роли действуют не позднее `AUTH_ACCESS_TTL`: административные эндпоинты не проверяют роль в БД на каждый запрос. `GET /auth/me` помимо `id`, `login`, `mustChangePassword`, `roles` возвращает `fullName`, `lastName`, `firstName`, `middleName`, `position`, `department`; клиенты `control-center` и `manager-helper` лишние поля игнорируют.

Известное расхождение: `id` отделов из файла загрузки текстовые (`dev`), а маршруты `/admin/departments/:id` и поле `departmentId` сотрудника принимают только UUID, поэтому отдел с нестандартным `id` из файла через admin-API не править. Для файла используйте UUID в `id` отделов.

### Origin портала

Портал отдаётся с того же домена, что и API, поэтому `SameSite=Strict` у cookie `mh_refresh` не менялся. В `AUTH_ALLOWED_ORIGINS` добавьте origin портала (например `https://portal.example.com`) через запятую рядом с `chrome-extension://*`; для локальной разработки на отдельном порту Vite укажите его origin.

### Сидер каталога портала Featurer
```bash
npm run seed:portal
```
Идемпотентно заводит продукты (control-center, manager-helper, Telegram-бот, веб) и их агентов из `src/modules/portal/application/portal-catalog.ts`; существующие записи (по `slug`) не перезаписываются, повторный запуск ничего не создаёт. Скрипт собирает проект (`nest build`), читает `.env` (нужен `POSTGRES_URL`), печатает `products created: N` и `agents created: M`. При ошибке БД выходит с ненулевым кодом, сообщение пишется в stderr. Запускать после первого старта приложения, когда миграции `028`/`029` применены.

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
