## 1. Setup и миграции БД

- [x] 1.1 Зафиксировать коммит начала change (`git rev-parse HEAD` до первых правок кода) в заметке к группе «Code review» (последняя группа) и прогнать базовые тесты `backend`, `control-center`, `manager-helper` (`npx vitest run` в каждом); проверка: команды зелёные, хэш стартового коммита записан в описание задачи 16.1
- [x] 1.2 Написать тест миграции `027_auth_user_roles` по образцу `backend/src/database/postgres/task-initiator-migration.spec.ts` (файл `auth-user-roles-migration.spec.ts`, `describe.skipIf(PROGRAMS_ETL_TEST_ADMIN_URL)`, `migrateBefore(dbUrl, '027')`): таблица `auth_user_roles(user_id → auth_users ON DELETE CASCADE, role)`, PK `(user_id, role)`, `CHECK (role IN ('developer'))`; вставка роли `admin` отвергается, дубль `(user_id, role)` отвергается; убедиться, что раннер видит файл (`npx vitest run src/database/postgres/auth-user-roles-migration.spec.ts`)
- [x] 1.3 Прогнать тест из 1.2 и зафиксировать red: падает из-за отсутствия таблицы/миграции `027`, а не из-за ошибки теста
- [x] 1.4 Создать `backend/db/migrations/027_auth_user_roles.sql` (аддитивная, без правки существующих таблиц)
- [x] 1.5 Прогнать тест из 1.2 и `npx vitest run src/database` (все `*-migration.spec.ts`): green, регрессий нет
- [x] 1.6 Написать тест миграции `028_portal_catalog` (`portal-catalog-migration.spec.ts`): таблицы `portal_products` (`slug` UNIQUE, `name`), `portal_agents` (`product_id` FK, `slug` UNIQUE, `name`), `portal_skills` (`agent_id` FK, `name`, `description` NOT NULL DEFAULT '', `status` CHECK из `planned|in_dev|testing|launched`, `created_at`, `status_changed_at`); проверки: дубль `slug` отвергается, неизвестный статус отвергается, навык без агента отвергается; убедиться, что раннер видит файл
- [x] 1.7 Прогнать тест из 1.6 и зафиксировать red: нет таблиц `portal_*`
- [x] 1.8 Создать `backend/db/migrations/028_portal_catalog.sql` (включая индекс `portal_skills (agent_id)` и `portal_skills (status)` для фильтра списка навыков)
- [x] 1.9 Прогнать тест из 1.6 и `npx vitest run src/database`: green, регрессий нет
- [x] 1.10 Написать тест миграции `029_portal_requests` (`portal-requests-migration.spec.ts`): таблица `portal_requests` (`author_id` → `auth_users`, поля анкеты `title`, `description`, `frequency_count`, `frequency_period` CHECK `day|week|month`, `minutes_per_run`, `people_count`, `decision` CHECK `pending|accepted|rejected`, `skill_id` NULL → `portal_skills`, `reject_reason` NULL, `decided_by`, `decided_at`, `created_at`); CHECK-инварианты из design.md п. 3: `accepted ⇔ skill_id IS NOT NULL`, `rejected ⇔ reject_reason` непустая, числа анкеты `> 0`; проверки нарушения каждого CHECK, наличие индексов `(author_id, created_at DESC)` и индекса очереди по `pending`; убедиться, что раннер видит файл
- [x] 1.11 Прогнать тест из 1.10 и зафиксировать red: нет таблицы `portal_requests`
- [x] 1.12 Создать `backend/db/migrations/029_portal_requests.sql`; колонки статуса «для автора» не добавлять
- [x] 1.13 Прогнать тест из 1.10 и `npx vitest run src/database`: green, регрессий нет
- [x] 1.14 Написать тест миграции `030_notifications_unique_target` (`notifications-target-index-migration.spec.ts`): после миграции два уведомления с одинаковыми `(source_event_id, recipient_id, type)` и разным `target_id` вставляются, а с одинаковым `target_id` отвергаются; все строки, созданные до миграции (`migrateBefore('030')`), остаются валидными; убедиться, что раннер видит файл
- [x] 1.15 Прогнать тест из 1.14 и зафиксировать red: старый индекс `(source_event_id, recipient_id, type)` не пускает второе уведомление
- [x] 1.16 Создать `backend/db/migrations/030_notifications_unique_target.sql`: заменить уникальный индекс на `(source_event_id, recipient_id, type, target_id)`; сверить имя старого индекса с `notifications-migration.spec.ts` и существующей миграцией; в заголовке миграции описать откат
- [x] 1.17 Прогнать тест из 1.14, `notifications-migration.spec.ts` и `npx vitest run src/modules/notifications/infrastructure/notification.repository.spec.ts`: green, регрессий нет (если репозиторий уведомлений ссылается на имя индекса в `ON CONFLICT`, поправить и зафиксировать)

## 2. auth: роли пользователя

- [x] 2.1 Написать тесты на `Role` (VO, закрытое множество `developer`, неизвестное значение отвергается), поле `rol: Role[]` в `AccessClaims` и выпуск/проверку токена в `JwtAccessTokenService` (`jwt-access-token.service.spec.ts`: роли попадают в токен и читаются обратно; токен без `rol` разбирается как пустой список), и убедиться, что раннер их видит
- [x] 2.2 Прогнать тесты из 2.1 и зафиксировать red: нет `Role` и поля `rol`
- [x] 2.3 Реализовать `Role` в `backend/src/modules/auth/domain`, расширить `AccessClaims` (`rol` необязательное при чтении) и `AccessTokenService` (порт и JWT-адаптер)
- [x] 2.4 Прогнать тесты из 2.1 и `npx vitest run src/modules/auth`: green, регрессий в существующих тестах токенов нет
- [x] 2.5 Написать тесты на чтение ролей: метод порта `UserRepository` (например `findRoles(userId)`), Slonik-реализация (PG-тест в `postgres-auth.repositories.spec.ts`: пустой набор, одна роль), `LoginUseCase` и `RefreshSessionUseCase` кладут актуальные из БД роли в выдаваемый токен (в `refresh-logout.use-cases.spec.ts` сценарий «роль назначили, затем refresh — новый токен содержит `developer`», «роль убрали — новый токен без роли»), и убедиться, что раннер их видит
- [x] 2.6 Прогнать тесты из 2.5 и зафиксировать red по причине отсутствия чтения ролей
- [x] 2.7 Реализовать чтение ролей в порте `UserRepository` и `slonik-user.repository.ts`, расширить `test-doubles.ts`, передать роли в `LoginUseCase` и `RefreshSessionUseCase`
- [x] 2.8 Прогнать тесты из 2.5 и `npx vitest run src/modules/auth`: green, регрессий нет
- [x] 2.9 Написать тесты на роли в профиле текущего пользователя (`GetCurrentUserUseCase`, `users.responses.ts`/`users.controller.spec.ts`: `roles: ['developer']`, для пользователя без ролей `roles: []`; роли берутся из claims токена без запроса в БД) и убедиться, что раннер их видит
- [x] 2.10 Прогнать тесты из 2.9 и зафиксировать red: в ответе профиля нет поля `roles`
- [x] 2.11 Реализовать `roles` в профиле (use case, ответ, схема ответа)
- [x] 2.12 Прогнать тесты из 2.9 и `npx vitest run src/modules/auth`: green, регрессий нет
- [x] 2.13 Написать тесты на `RolesGuard` и декоратор `@Roles()` (`roles.guard.spec.ts`): роль есть — пропускает; роли нет — `ForbiddenError` → 403; нет токена — 401 раньше проверки роли; роль в уже выданном токене действует до истечения токена; эндпоинт без `@Roles` не затрагивается; убедиться, что раннер их видит
- [x] 2.14 Прогнать тесты из 2.13 и зафиксировать red: нет guard'а и декоратора
- [x] 2.15 Реализовать `RolesGuard` и `@Roles()` в `backend/src/modules/auth/interface/http` (рядом с `jwt-auth.guard.ts`, `decorators.ts`), экспортировать из `AuthModule`; ошибка 403 маппится через `auth-error-status.ts` или общий фильтр ошибок (сверить с существующим `ForbiddenError`)
- [x] 2.16 Прогнать тесты из 2.13 и `npx vitest run src/modules/auth`: green, регрессий нет
- [x] 2.17 Написать тесты на роли в `seed:users` (`seed-users.use-case.spec.ts`, `seed-users.cli.spec.ts`): необязательное поле `roles` в JSON, назначение `developer`, повторный запуск не создаёт дубликатов (`ON CONFLICT DO NOTHING`), неизвестная роль даёт ошибку запуска и роль не назначается, пользователи без `roles` не затрагиваются; убедиться, что раннер их видит
- [x] 2.18 Прогнать тесты из 2.17 и зафиксировать red: сидер не знает про `roles`
- [x] 2.19 Реализовать `roles` в `SeedUsersUseCase`, CLI и порте записи ролей (Slonik `INSERT … ON CONFLICT DO NOTHING`); обновить `backend/README.md` (формат JSON для `seed:users`)
- [x] 2.20 Прогнать тесты из 2.17 и `npx vitest run src/modules/auth`: green, регрессий нет
- [x] 2.21 Проверить допущение из design.md (п. 2) о том, что клиенты не разбирают claims сами: `grep -rn "jwt\|atob\|decodeJwt\|claims" control-center/src manager-helper/src` и прогнать `npx vitest run` и `npm run typecheck` в `control-center` и `manager-helper`; проверка: в заметке к задаче указан результат поиска (клиенты не декодируют токен) и тесты зелёные; если найдено разбирающее claims место, зафиксировать его и добавить тест на токен с полем `rol`

## 3. portal: домен

- [x] 3.1 Создать каркас модуля `backend/src/modules/portal` (`domain`, `application`, `infrastructure`, `interface`, `contracts`) и пустой `PortalModule`, подключить его в корневой модуль приложения (по образцу `tasks.module.ts`); проверка: `npm run build` в `backend` проходит, приложение стартует в тестовом режиме
- [x] 3.2 Написать тесты на `SkillStatus` (`next()`, `canAdvanceTo`: только соседний вперёд; повтор, пропуск, возврат и выход из `launched` отклоняются; разбор неизвестного значения отвергается) и VO `SkillName`, `RequestTitle`, `Frequency`, `RejectReason` (обрезка пробелов, пустое значение, предел длины, целое больше нуля, период `day|week|month`) и убедиться, что раннер их видит
- [x] 3.3 Прогнать тесты из 3.2 и зафиксировать red: нет классов
- [x] 3.4 Реализовать `SkillStatus`, `SkillName`, `RequestTitle`, `Frequency`, `RejectReason` и доменные ошибки в `portal/domain` (`InvalidSkillTransitionError` → 409, `InvalidRejectReasonError` → 400 и ошибки валидации VO → 400 на базе `ArgumentInvalidError` из `shared/errors`)
- [x] 3.5 Прогнать тесты из 3.2 и `npx vitest run src/modules/portal`: green, регрессий нет
- [x] 3.6 Написать тесты на агрегат `Skill` (новый навык всегда `planned`; `advance(to, now)` меняет статус и `statusChangedAt`; недопустимый переход — `InvalidSkillTransitionError`, состояние не меняется) и убедиться, что раннер их видит
- [x] 3.7 Прогнать тесты из 3.6 и зафиксировать red: нет `Skill`
- [x] 3.8 Реализовать `Skill` (фабрика создания и восстановление из хранилища) в `portal/domain`
- [x] 3.9 Прогнать тесты из 3.6 и `npx vitest run src/modules/portal`: green, регрессий нет
- [x] 3.10 Написать тесты на `RequestDecision` (размеченное объединение `pending|accepted|rejected`) и агрегат `IdeaRequest` (создание в `pending`; валидация полей анкеты; `accept(skillId, by, now)` и `reject(reason, by, now)` только из `pending`; повторное решение — `RequestAlreadyDecidedError` → 409; отклонение с пустой причиной — `InvalidRejectReasonError`; «принято без навыка» невозможно) и убедиться, что раннер их видит
- [x] 3.11 Прогнать тесты из 3.10 и зафиксировать red: нет `IdeaRequest`
- [x] 3.12 Реализовать `RequestDecision`, `IdeaRequest`, `RequestAlreadyDecidedError`, `RequestNotFoundError`, `SkillNotFoundError`, `AgentNotFoundError`; завести простые типы `Product` и `Agent` (данные из seed, без поведения; отдельные тесты не нужны: поведения нет, поля проверяются репозиторными тестами в группе 5)
- [x] 3.13 Прогнать тесты из 3.10 и `npx vitest run src/modules/portal`: green, регрессий нет
- [x] 3.14 Написать тесты на `RequestStatusPolicy.statusOf(decision, skillStatus)` (`pending` → «На рассмотрении», `rejected` → «Отклонена», `accepted` + статус навыка → `planned`/`in_dev`/`testing`/`launched` с метками «Запланировано», «В разработке», «Тестируется», «Запущено»; `accepted` без статуса навыка — ошибка целостности) и убедиться, что раннер их видит
- [x] 3.15 Прогнать тесты из 3.14 и зафиксировать red: нет политики
- [x] 3.16 Реализовать `RequestStatusPolicy` и тип `RequestStatus` (с единым словарём меток в `portal/contracts`, см. 4.3)
- [x] 3.17 Прогнать тесты из 3.14 и `npx vitest run src/modules/portal`: green, регрессий нет

## 4. portal: контракты событий

- [x] 4.1 Написать тесты на события `RequestAccepted`, `RequestRejected`, `SkillStatusChanged` (по образцу `tasks/contracts/task-created.event.spec.ts`: поля из architecture.md, `SkillStatusChanged` несёт `linked: LinkedRequestSnapshot[]`), на словарь русских названий статусов навыка и на регистрацию в outbox через `registerPortalEvents` (по образцу `register-task-events.ts`), и убедиться, что раннер их видит
- [x] 4.2 Прогнать тесты из 4.1 и зафиксировать red: нет контрактов
- [x] 4.3 Реализовать события, `LinkedRequestSnapshot`, словарь меток статусов и `register-portal-events.ts` в `portal/contracts`, вызвать регистрацию из `PortalModule`
- [x] 4.4 Прогнать тесты из 4.1 и `npx vitest run src/modules/portal src/shared/outbox`: green, регрессий нет

## 5. portal: порты и Slonik-репозитории

- [x] 5.1 Объявить порты как abstract class в `portal/domain/ports`: `RequestRepository` (`save`, `findById`, `listLinkedToSkill`), `SkillRepository` (`findById`, `findForUpdate`, `save`), `CatalogRepository` (чтение агентов с продуктами, `findAgent`, идемпотентный seed), `RequestQuery` (`listByAuthor`, `listPending`, `findView`), `ListSkills`-запрос (можно в `SkillQuery`); `Clock` как в `tasks`; проверка: `npm run build` проходит, порты используются в тестовых двойниках из 6.1 (чистые объявления без логики, отдельные тесты не нужны)
- [x] 5.2 Написать PG-тесты репозиториев по образцу `tasks/infrastructure/postgres-tasks.repositories.spec.ts` (`portal/infrastructure/postgres-portal.repositories.spec.ts`, `describe.skipIf`): `SkillRepository.findForUpdate` блокирует строку (второй параллельный `FOR UPDATE` ждёт), `save` навыка с условным обновлением `WHERE status = <ожидаемый предыдущий>` (0 строк → конфликт), `RequestRepository.save` с условным `UPDATE … WHERE decision = 'pending'` (0 строк → `RequestAlreadyDecidedError`), `listLinkedToSkill` возвращает снимок только принятых заявок навыка, `RequestQuery.listByAuthor` (только свои, новые первыми, пагинация, JOIN с навыком, статус выводится политикой), `listPending` (старые первыми, только `pending`, автор в ответе), `CatalogRepository` seed идемпотентен и не перезаписывает записи; убедиться, что раннер видит тесты
- [x] 5.3 Прогнать тесты из 5.2 и зафиксировать red: нет реализаций репозиториев
- [x] 5.4 Реализовать `slonik-request.repository.ts`, `slonik-request.query.ts`, `slonik-skill.repository.ts`, `slonik-catalog.repository.ts`, `system-clock.ts` в `portal/infrastructure` и провайдеры в `PortalModule`
- [x] 5.5 Прогнать тесты из 5.2 и `npx vitest run src/modules/portal`: green, регрессий нет

## 6. portal: use case'ы (application)

- [x] 6.1 Создать `portal/application/test-doubles.ts` (in-memory репозитории, `FakeClock`, фейковый `TransactionRunner` и outbox по образцу `tasks/application/test-doubles.ts`) и `request-view.ts`/`skill-view.ts` (read-модели `RequestView`, `SkillView`); проверка: файлы компилируются (`npm run build`), используются тестами 6.2+ (инфраструктура тестов без логики, отдельные тесты не нужны)
- [x] 6.2 Написать тесты на `SubmitRequestUseCase` (автор берётся из токена, а не из запроса; статус «На рассмотрении»; недопустимые значения → 400 без создания), `ListMyRequestsUseCase` (только свои, новые первыми, `total`) и `GetRequestUseCase` (автор или `developer`; чужая для остальных → `RequestNotFoundError`), и убедиться, что раннер их видит
- [x] 6.3 Прогнать тесты из 6.2 и зафиксировать red: нет use case'ов
- [x] 6.4 Реализовать `SubmitRequestUseCase`, `ListMyRequestsUseCase`, `GetRequestUseCase`
- [x] 6.5 Прогнать тесты из 6.2 и `npx vitest run src/modules/portal`: green, регрессий нет
- [x] 6.6 Написать тесты на `ListQueueUseCase` (только `pending`, старые первыми, пагинация) и `ListAgentsUseCase` (агенты вместе с продуктами), и убедиться, что раннер их видит
- [x] 6.7 Прогнать тесты из 6.6 и зафиксировать red: нет use case'ов
- [x] 6.8 Реализовать `ListQueueUseCase` и `ListAgentsUseCase`
- [x] 6.9 Прогнать тесты из 6.6 и `npx vitest run src/modules/portal`: green, регрессий нет
- [x] 6.10 Написать тесты на `CreateSkillUseCase` (статус `planned`, название из пробелов → 400, несуществующий агент → `AgentNotFoundError`) и `ListSkillsUseCase` (фильтр по статусу, число привязанных заявок, агент и продукт в ответе), и убедиться, что раннер их видит
- [x] 6.11 Прогнать тесты из 6.10 и зафиксировать red: нет use case'ов
- [x] 6.12 Реализовать `CreateSkillUseCase` и `ListSkillsUseCase`
- [x] 6.13 Прогнать тесты из 6.10 и `npx vitest run src/modules/portal`: green, регрессий нет
- [x] 6.14 Написать тесты на `AcceptRequestUseCase`: привязка к существующему навыку; создание навыка у агента и привязка в одной транзакции; ошибка при создании (нет агента) откатывает всё, заявка остаётся `pending`; несуществующий навык → 404; повторное решение → 409 без изменений; запись `RequestAccepted` в outbox ровно один раз и ни одного события при 404/409; несколько заявок на один навык; навык блокируется `findForUpdate`; убедиться, что раннер их видит
- [x] 6.15 Прогнать тесты из 6.14 и зафиксировать red: нет use case'а
- [x] 6.16 Реализовать `AcceptRequestUseCase` (транзакция через `TransactionRunner`)
- [x] 6.17 Прогнать тесты из 6.14 и `npx vitest run src/modules/portal`: green, регрессий нет
- [x] 6.18 Написать тесты на `RejectRequestUseCase` (причина обязательна, пустая → 400; повтор → 409; принятую отклонить → 409; событие `RequestRejected` записывается один раз, при ошибках события нет), и убедиться, что раннер их видит
- [x] 6.19 Прогнать тесты из 6.18 и зафиксировать red: нет use case'а
- [x] 6.20 Реализовать `RejectRequestUseCase`
- [x] 6.21 Прогнать тесты из 6.18 и `npx vitest run src/modules/portal`: green, регрессий нет
- [x] 6.22 Написать тесты на `ChangeSkillStatusUseCase`: переход вперёд обновляет статус и `statusChangedAt`; пропуск, возврат, повтор и выход из `launched` → 409 без события; неизвестный навык → 404; событие `SkillStatusChanged` содержит прежний и новый статус, инициатора и снимок привязанных заявок двух авторов (читается в той же транзакции после `findForUpdate`); навык без заявок — событие с пустым снимком; проигранная гонка по условному `UPDATE` → 409; убедиться, что раннер их видит
- [x] 6.23 Прогнать тесты из 6.22 и зафиксировать red: нет use case'а
- [x] 6.24 Реализовать `ChangeSkillStatusUseCase`
- [x] 6.25 Прогнать тесты из 6.22 и `npx vitest run src/modules/portal`: green, регрессий нет
- [x] 6.26 Написать тесты на `SeedPortalCatalogUseCase` и константы состава (design.md п. 9): продукты `control-center`, `manager-helper`, `telegram-bot`, `web` и их агенты (Ассистент, Задачи, Встречи, Цены; Аудит сделок; Агент задач; у `web` агентов нет), фиксированные `slug`, повторный запуск не меняет количество и не перезаписывает записи; убедиться, что раннер их видит
- [x] 6.27 Прогнать тесты из 6.26 и зафиксировать red: нет use case'а и констант
- [x] 6.28 Реализовать `SeedPortalCatalogUseCase` и константы каталога в коде модуля (не env-JSON)
- [x] 6.29 Прогнать тесты из 6.26 и `npx vitest run src/modules/portal`: green, регрессий нет

## 7. portal: HTTP API, seed-CLI и сквозной e2e на бэкенде

- [x] 7.1 Написать тесты контроллеров и zod-схем (по образцу `tasks.controller.spec.ts` и `interface/http/testing/http-fixture.ts`, свой `portal/interface/http/testing/http-fixture.ts`): `POST /portal/requests` (201/400/401), `GET /portal/requests/my` (пагинация; `limit` выше максимума и нечисловая страница → 400), `GET /portal/requests/:id` (автор, `developer`, чужая → 404, неверный формат id → 404/400 без 500), `GET /portal/queue` (`developer`; без роли 403; без токена 401), `POST /portal/requests/:id/accept` (тело либо `{skillId}`, либо `{agentId,name,description}`, смешение вариантов → 400; 403/404/409), `POST …/reject` (причина обязательна → 400), `GET /portal/agents` (любой вошедший), `GET`/`POST /portal/skills` и `POST /portal/skills/:id/status` (`developer`; неизвестный статус → 400); убедиться, что раннер их видит
- [x] 7.2 Прогнать тесты из 7.1 и зафиксировать red: нет контроллеров и схем
- [x] 7.3 Реализовать `portal/interface/http`: схемы zod (`requests.schemas.ts`, `skills.schemas.ts`, пагинация по `pagination.schema.ts`), контроллеры с `JwtAuthGuard`/`RolesGuard`, ответы (`*.responses.ts`) и маппинг ошибок домена в HTTP; собрать провайдеры и контроллеры в `PortalModule`
- [x] 7.4 Прогнать тесты из 7.1 и `npx vitest run src/modules/portal`: green, регрессий нет
- [x] 7.5 Написать тест CLI `seed:portal` (по образцу `seed-users.cli.spec.ts`, `portal/application/seed-portal.cli.spec.ts`): первый запуск создаёт продукты и агентов, повторный не меняет количество, ненулевой код выхода при ошибке БД; убедиться, что раннер его видит
- [x] 7.6 Прогнать тест из 7.5 и зафиксировать red: нет CLI
- [x] 7.7 Реализовать `seed-portal.cli.ts`, скрипт `backend/scripts/seed-portal.mjs` и npm-скрипт `seed:portal` в `backend/package.json` (по образцу `seed:users`); задокументировать запуск в `backend/README.md`
- [x] 7.8 Прогнать тест из 7.5 и `npx vitest run src/modules/portal`: green, регрессий нет
- [x] 7.9 Написать e2e-тест `portal/portal-flow.e2e.spec.ts` по образцу `tasks/tasks-flow.e2e.spec.ts` (`describe.skipIf` без PG): сотрудник подаёт заявку → разработчик принимает с созданием навыка → автор видит «Запланировано» → разработчик двигает `planned → in_dev → testing → launched` → «Мои заявки» автора показывают «Запущено» на каждом шаге; роли выдаются через токен (login/refresh), попытка сотрудника без роли → 403; убедиться, что раннер его видит
- [x] 7.10 Прогнать тест из 7.9 и зафиксировать red по ожидаемой причине (дыры в проводке модуля, если они есть); если тест сразу зелёный из-за готовых 7.3–7.7, зафиксировать это явно и убедиться, что он падает при временном отключении `RolesGuard` на `/portal/queue`
- [x] 7.11 Довести проводку `PortalModule` (импорт `AuthModule`, `OutboxModule`, `TransactionRunner`, регистрация событий) до зелёного e2e
- [x] 7.12 Прогнать тест из 7.9 и весь `npx vitest run` в `backend`: green, регрессий нет

## 8. notifications: тип `request` и подписчики

- [x] 8.1 Написать тесты на `NotificationTarget` с типом `request` (`notification-target.spec.ts`), на правила `RequestDecisionRule` (тип `request.accepted` с названием заявки, навыка и статусом на русском; `request.rejected` с названием и причиной; инициатор — разработчик; пусто при совпадении автора и разработчика) и `SkillStatusChangedRule` (по одному черновику на заявку из снимка со ссылкой `request` на заявку; пропуск заявок разработчика; пустой снимок — пусто; новый статус на русском) в `domain/*.rule.spec.ts` по образцу `task-assigned-on-create.rule.spec.ts`, и убедиться, что раннер их видит
- [x] 8.2 Прогнать тесты из 8.1 и зафиксировать red: нет типа `request` и правил
- [x] 8.3 Добавить `'request'` в `NOTIFICATION_TARGET_TYPES`, реализовать `request-decision.rule.ts` и `skill-status-changed.rule.ts` в `notifications/domain` (тексты на русском, словарь статусов из `portal/contracts`)
- [x] 8.4 Прогнать тесты из 8.1 и `npx vitest run src/modules/notifications`: green, регрессий нет
- [x] 8.5 Написать тесты на подписчики `RequestDecidedSubscriber` и `SkillStatusChangedSubscriber` (по образцу `task-created.subscriber.spec.ts`: один вызов `CreateNotificationsUseCase.execute(event.id, drafts)`; логин разработчика из каталога пользователей; повторная обработка не дублирует) и на регистрацию подписок (`notification-event-subscriptions.spec.ts`, `register-notification-events.ts`), и убедиться, что раннер их видит
- [x] 8.6 Прогнать тесты из 8.5 и зафиксировать red: нет подписчиков
- [x] 8.7 Реализовать оба подписчика и зарегистрировать их в `NotificationsModule` и в подписках на события `portal`
- [x] 8.8 Прогнать тесты из 8.5 и `npx vitest run src/modules/notifications`: green, регрессий нет
- [x] 8.9 Написать e2e-тест потока в `notifications-flow.e2e.spec.ts` (или новом `portal-notifications.e2e.spec.ts`, по образцу существующего): событие принятия → одно уведомление `request.accepted` автору; событие отклонения → `request.rejected` с причиной; смена статуса навыка с двумя заявками разных авторов → по одному уведомлению каждому; два уведомления одному автору за две его заявки на один навык (проверка индекса из 1.16); повторная обработка того же события не создаёт дубликатов; автор = разработчик → уведомления нет; заявка не из снимка (отклонённая/непривязанная) уведомления не порождает; убедиться, что раннер его видит
- [x] 8.10 Прогнать тест из 8.9 и зафиксировать red по ожидаемой причине (нет подписчиков/проводки, либо дублирование под старым индексом)
- [x] 8.11 Довести проводку до зелёного e2e (подписки в outbox, Telegram-канал без изменений: доставка идёт по общему конвейеру)
- [x] 8.12 Прогнать тест из 8.9 и весь `npx vitest run` в `backend`: green, регрессий в `notifications`, `tasks`, `auth` нет

## 9. control-center: клик по уведомлению `request`

- [x] 9.1 Изучить `control-center/src/renderer/src/features/notifications/use-open-notification.ts`, `lib/backend/notifications.schema.ts` (`NOTIFICATION_TARGET`), существующий путь «открыть внешний адрес» в `src/main/index.ts` (`openExternal` с проверкой безопасного URL) и место конфигурации адреса бэкенда (`src/main/auth/auth-composition.ts`, `notifications-composition.ts`); проверка: в заметке к задаче указаны файлы и способ хранения конфигурации, в которую добавляется `portalUrl`
- [x] 9.2 Написать тесты (`use-open-notification.test.tsx`, тесты main-процесса и конфигурации): клик по `request` отмечает уведомление прочитанным и запрашивает открытие `<адрес портала>/requests/<encodeURIComponent(id)>` во внешнем браузере; адрес портала не задан → прочитано, сообщение «портал недоступен», список не ломается; идентификатор, из которого нельзя составить адрес настроенного портала, → браузер не открывается, понятное сообщение; открываются только адреса настроенного портала (origin совпадает); клики по `task` и `chat` работают как прежде; портал не открывается в окне приложения; убедиться, что раннер их видит
- [x] 9.3 Прогнать тесты из 9.2 и зафиксировать red: ветки `request` и конфигурации нет
- [x] 9.4 Реализовать: константу `request` в `notifications.schema.ts`, ветку в `use-open-notification.ts`, конфигурацию `portalUrl` рядом с адресом бэкенда, IPC/вызов открытия внешнего адреса с проверкой origin, текст уведомления о недоступности портала
- [x] 9.5 Прогнать тесты из 9.2, `npx vitest run` и `npm run typecheck` в `control-center`: green, регрессий нет

## 10. manager-helper: клик по уведомлению `request`

- [x] 10.1 Изучить `manager-helper/src/sidepanel/App.tsx` (`openNotification`), `background/notifications/system-notifier.ts`, `shared/notifications/pending-target.ts`, `shared/settings.ts` (ключ `backendUrl`) и страницу `options/App.tsx`; проверка: в заметке к задаче указан способ хранения `portalUrl` и точки правки
- [x] 10.2 Написать тесты: `settings.test.ts` (чтение и запись `portalUrl`, пустое значение), `pending-target.test.ts` (вариант `request` с `requestId`), `system-notifier.test.ts` (клик по системному уведомлению `request` при закрытой панели создаёт вкладку `chrome.tabs.create` с `<адрес портала>/requests/<encodeURIComponent(id)>`, помечает прочитанным, без обязательного открытия панели; сводное уведомление по-прежнему открывает список; портал не задан → прочитано, сообщение «портал недоступен» в панели), тест сайдпанели (`App` в `sidepanel`: клик по `request` открывает вкладку, помечает прочитанным, при незаданном адресе показывает сообщение; клик по `task` без изменений); открывается только адрес настроенного портала; в манифест новых разрешений не добавляется (тест/проверка `manifest`); убедиться, что раннер их видит
- [x] 10.3 Прогнать тесты из 10.2 и зафиксировать red: нет ветки `request`, поля `portalUrl`
- [x] 10.4 Реализовать: `portalUrl` в настройках и на странице options, вариант `request` в `pending-target.ts` и в `notifications-schema.ts` (если требуется), ветки в `sidepanel/App.tsx` и `system-notifier.ts`, общий помощник сборки адреса портала с проверкой origin
- [x] 10.5 Прогнать тесты из 10.2, `npx vitest run`, `npm run typecheck` и `npm run lint` в `manager-helper`: green, `manifest.json` без новых разрешений (`git diff` по манифесту пуст), регрессий нет

## 11. portal/: каркас фронтенда

- [x] 11.1 Создать приложение `portal/` в корне проекта на стеке `control-center` (Vite, React 19, TypeScript, TanStack Query, zustand, Tailwind 4, zod, `react-router`, Vitest + Testing Library), `package.json` со скриптами `dev`, `build`, `typecheck`, `test`, настройка `vitest.config.ts` и `tsconfig`, переменная окружения адреса API; структура `src/{features,components/ui,layouts,lib,stores,pages}`; проверка: `npm install`, `npm run build`, `npm run typecheck`, `npx vitest run` (тест-заглушка рендера `App`) проходят
- [x] 11.2 Перенести токены дизайн-кита (цвета, шрифты, отступы) из `design/design-kit.lib.pen` / темы `control-center` в Tailwind-тему `portal/src/styles` (копированием, без общего пакета); проверка: сверить значения токенов со стилем `control-center` и дизайн-китом через `mcp__pencil__*` (Get/execute), скриншот страницы-заглушки с использованием токенов, в заметке указан список перенесённых токенов
- [x] 11.3 Реализовать базовые компоненты `components/ui` (Button, Input, Textarea, Select, Badge, Table, Alert) на токенах. Тесты 1/2/4 опущены: компоненты не содержат ветвлений, данных и состояний, это чистая вёрстка на токенах; доступность (связь подписи и поля, `aria-invalid`/`aria-describedby` для ошибок) закладывается в Input/Textarea/Select и проверяется в тестах форм 15.x. Проверка: визуальная сверка с `design-kit.lib.pen` (компоненты читать через `mcp__pencil__execute/Get`; Node ID компонентов см. `ui-design.md` (раздел «Новые компоненты UI Kit», если появится) — заполнить после согласования дизайна) и скриншот на ширине 360 px без горизонтальной прокрутки
- [x] 11.4 Написать тесты на `lib/` портала: клиент API (`lib/api-client.ts`: базовый адрес, заголовок `Authorization`, `credentials: 'include'`), нормализация ошибок в один тип (`lib/errors.ts`: 401, 403, 404, 409, 400 и «сервер недоступен» различаются), zod-схемы ответов `lib/schemas` (заявка, навык, агент, профиль с `roles`, пагинация) и убедиться, что раннер их видит
- [x] 11.5 Прогнать тесты из 11.4 и зафиксировать red: нет модулей `lib/`
- [x] 11.6 Реализовать `lib/api-client.ts`, `lib/errors.ts`, `lib/schemas`
- [x] 11.7 Прогнать тесты из 11.4 и `npx vitest run` в `portal`: green, регрессий нет

## 12. portal/: feature `auth`

- [x] 12.1 Написать тесты на `refresh-coordinator` (параллельные запросы при 401 дожидаются одного общего refresh; один повтор запроса; ошибка refresh → сессия сбрасывается), `session.store.ts` и `useSession` (токен только в памяти, статусы `restoring|signedIn|signedOut|unavailable`, `roles` из профиля), `auth.api.ts` (login, refresh по cookie, logout, профиль, смена пароля) и `useLogin` (неверные данные и «сервер недоступен» — разные ошибки); убедиться, что раннер их видит
- [x] 12.2 Прогнать тесты из 12.1 и зафиксировать red: нет feature `auth`
- [x] 12.3 Реализовать `portal/src/features/auth` (`model/session.store.ts`, `auth.api.ts`, `refresh-coordinator.ts`, `useLogin`, `SessionProvider` с восстановлением сессии по cookie при открытии, публичный API через `index.ts`); токен и refresh не пишутся в `localStorage`/`sessionStorage`
- [x] 12.4 Прогнать тесты из 12.1 и `npx vitest run` в `portal`: green, регрессий нет
- [x] 12.5 Написать тесты на `RequireAuth` (не вошёл → редирект на `/login` с запоминанием запрошенного адреса, после входа возврат на него; `mustChangePassword` → `/change-password` до остальных разделов; состояние восстановления и сообщение «сервер недоступен» вместо экрана входа) и `RequireRole` (нет роли `developer` → редирект на «Мои заявки», данные раздела не запрашиваются), и убедиться, что раннер их видит
- [x] 12.6 Прогнать тесты из 12.5 и зафиксировать red: нет guard-компонентов
- [x] 12.7 Реализовать `RequireAuth` и `RequireRole`
- [x] 12.8 Прогнать тесты из 12.5 и `npx vitest run` в `portal`: green, регрессий нет

## 13. portal/: features `requests`, `decision`, `skills`, `shell`

- [x] 13.1 Написать тесты на модель `requests`: `requests.schema.ts` (форма анкеты: пустое название, нулевые/дробные числа, период), `requests.api.ts`, `myRequestsQuery(page)`, `requestQuery(id)` (404 и неверный формат id → «не найдено»), `useSubmitRequest` (инвалидирует список, при ошибке сервера вводимые значения не теряются) и убедиться, что раннер их видит
- [x] 13.2 Прогнать тесты из 13.1 и зафиксировать red: нет модели `requests`
- [x] 13.3 Реализовать `features/requests/model` (`requests.api.ts`, `requests.queries.ts`, `requests.schema.ts`, `useSubmitRequest`)
- [x] 13.4 Прогнать тесты из 13.1 и `npx vitest run` в `portal`: green, регрессий нет
- [x] 13.5 Написать тесты на `RequestForm` (подписи полей, клиентская проверка и ошибки у соответствующих полей, форма не отправляется при ошибках, сохранение ввода при ошибке сервера, отправка только клавиатурой), `RequestList` (загрузка, пустое состояние со ссылкой на подачу идеи, ошибка с кнопкой повтора, статусы и дата, новые первыми), `RequestStatusBadge` (русские метки шести статусов) и `RequestDetails` (причина отказа для отклонённой, название и описание навыка для принятой), и убедиться, что раннер их видит
- [x] 13.6 Прогнать тесты из 13.5 и зафиксировать red: нет компонентов
- [x] 13.7 Реализовать `RequestForm`, `RequestList`, `RequestStatusBadge`, `RequestDetails` и публичный `features/requests/index.ts`. Фрейм в `design/synergy-design-kit.pen`: Node ID: `NWrOV` (анкета), `wPIcL` (ошибки), `eUQV2` (390), `NG7rx` (список), `pUmdC` (заявка автора), `crj8h`, `kDn1W` (состояния) (блок `Portal` `t2DLO`, подробности в `ui-design.md`); читать через mcp__pencil__execute/Get
- [x] 13.8 Прогнать тесты из 13.5 и `npx vitest run` в `portal`: green, регрессий нет
- [x] 13.9 Написать тесты на модель `skills` и `decision`: `skills.api.ts`, `skillsQuery(filter, page)`, `agentsQuery`, `useChangeSkillStatus` (409 → обновление навыка и сообщение), `queueQuery(page)`, `useAcceptRequest` и `useRejectRequest` (успех убирает заявку из очереди; 409 → сообщение «решение уже принято» и обновление очереди) и убедиться, что раннер их видит
- [x] 13.10 Прогнать тесты из 13.9 и зафиксировать red: нет моделей
- [x] 13.11 Реализовать `features/skills/model` (`skills.api.ts`, `skills.queries.ts`, `catalog.queries.ts`, `useChangeSkillStatus`) и `features/decision/model` (`decision.api.ts`, `queueQuery`, `use-accept-request.ts`, `use-reject-request.ts`)
- [x] 13.12 Прогнать тесты из 13.9 и `npx vitest run` в `portal`: green, регрессий нет
- [x] 13.13 Написать тесты на `DecisionPanel` (переключатель «принять / отклонить»; отклонение без причины не отправляется, ошибка у поля причины; принятие без выбранного или заполненного навыка не отправляется; тело `{skillId}` либо `{agentId,name,description}`; 409 → сообщение), `SkillPicker` (выбор существующего навыка либо создание нового с выбором агента и показом его продукта) и убедиться, что раннер их видит
- [x] 13.14 Прогнать тесты из 13.13 и зафиксировать red: нет компонентов
- [x] 13.15 Реализовать `DecisionPanel`, `SkillPicker` и публичные `index.ts` фич `decision` и `skills`. Фрейм в `design/synergy-design-kit.pen`: Node ID: `h4U9z` (существующий навык), `S87f2` (новый навык), `qbiSZ` (отклонение), `Wnf0k` (конфликт 409) (блок `Portal` `t2DLO`, подробности в `ui-design.md`); читать через mcp__pencil__execute/Get
- [x] 13.16 Прогнать тесты из 13.13 и `npx vitest run` в `portal`: green, регрессий нет
- [x] 13.17 Написать тесты на `SkillsTable` (колонки: название, агент, продукт, статус, число заявок; фильтр по статусу вызывает `onFilterChange`) и `SkillStatusAction` (предлагает только следующий статус, скрыта для `launched`, после смены показывает новое значение, при 409 показывает сообщение и актуальное состояние), и убедиться, что раннер их видит
- [x] 13.18 Прогнать тесты из 13.17 и зафиксировать red: нет компонентов
- [x] 13.19 Реализовать `SkillsTable` и `SkillStatusAction`. Фрейм в `design/synergy-design-kit.pen`: Node ID: `ZqbKp` (таблица), `OKW2d` (конфликт 409), `JDRxT` (пустой фильтр) (блок `Portal` `t2DLO`, подробности в `ui-design.md`); читать через mcp__pencil__execute/Get
- [x] 13.20 Прогнать тесты из 13.17 и `npx vitest run` в `portal`: green, регрессий нет
- [x] 13.21 Написать тесты на `AppLayout` (именованные слоты `header` и `body`) и `NavMenu` (пользователь без ролей: «Новая идея» и «Мои заявки»; `developer`: дополнительно «Очередь» и «Навыки»; кнопка выхода вызывает `logout`), и убедиться, что раннер их видит
- [x] 13.22 Прогнать тесты из 13.21 и зафиксировать red: нет `shell`
- [x] 13.23 Реализовать `features/shell` (`AppLayout` в `layouts/`, `NavMenu`). Фрейм в `design/synergy-design-kit.pen`: Node ID: frame `Top Bar` внутри `NG7rx` (разработчик: `ewCKn`) (блок `Portal` `t2DLO`, подробности в `ui-design.md`); читать через mcp__pencil__execute/Get
- [x] 13.24 Прогнать тесты из 13.21 и `npx vitest run` в `portal`: green, регрессий нет

## 14. portal/: страницы и маршрутизация

- [x] 14.1 Написать тесты на `LoginPage` и `ChangePasswordPage` (`useLogin`: неверные данные → ошибка и остаёмся на `/login`; успешный вход → «Мои заявки» либо запрошенный адрес; смена временного пароля; недоступный сервер) и убедиться, что раннер их видит
- [x] 14.2 Прогнать тесты из 14.1 и зафиксировать red: нет страниц
- [x] 14.3 Реализовать `LoginPage` (`/login`) и `ChangePasswordPage` (`/change-password`). Фрейм в `design/synergy-design-kit.pen`: Node ID: `V7vIP` (вход), `sln7u`, `aMavb` (390), `nftPU` (неверные данные), `a1zxci` (сервер недоступен), `QjzyC` (восстановление сессии), `SOPge` (смена пароля) (блок `Portal` `t2DLO`, подробности в `ui-design.md`); читать через mcp__pencil__execute/Get
- [x] 14.4 Прогнать тесты из 14.1 и `npx vitest run` в `portal`: green, регрессий нет
- [x] 14.5 Написать тесты на `NewIdeaPage` (успешная подача: подтверждение и переход в «Мои заявки»; ошибки полей; сохранение ввода при ошибке сервера) и `MyRequestsPage` (`useMyRequests`: состояния загрузки, пусто, ошибка с повтором, актуальный статус при каждом открытии/обновлении раздела), и убедиться, что раннер их видит
- [x] 14.6 Прогнать тесты из 14.5 и зафиксировать red: нет страниц
- [x] 14.7 Реализовать `NewIdeaPage` (`/ideas/new`) и `MyRequestsPage` (`/requests`); данные обновляются при каждом монтировании (`refetchOnMount: 'always'` либо `staleTime: 0`). Фрейм в `design/synergy-design-kit.pen`: Node ID: `NWrOV`, `wPIcL`, `eUQV2` (анкета); `NG7rx`, `lhjXp`, `GGn1b`, `ZqSj4`, `xwcZ5` (мои заявки и состояния) (блок `Portal` `t2DLO`, подробности в `ui-design.md`); читать через mcp__pencil__execute/Get
- [x] 14.8 Прогнать тесты из 14.5 и `npx vitest run` в `portal`: green, регрессий нет
- [x] 14.9 Написать тесты на `RequestPage` (`/requests/:id`, `useRequest`): автор видит свою заявку; 404, чужая заявка и неверный формат идентификатора → «Заявка не найдена» со ссылкой на «Мои заявки», без технической ошибки; для `developer` и заявки `pending` показывается `DecisionPanel`, после решения экран обновляется; для обычного сотрудника панель решения не показывается; вход по прямой ссылке без сессии → экран входа и возврат на заявку, и убедиться, что раннер их видит
- [x] 14.10 Прогнать тесты из 14.9 и зафиксировать red: нет страницы
- [x] 14.11 Реализовать `RequestPage`. Фрейм в `design/synergy-design-kit.pen`: Node ID: `pUmdC`, `crj8h`, `kDn1W` (автор), `Qrxuo`, `aHkiT` (390); `h4U9z`, `S87f2`, `qbiSZ`, `Wnf0k` (решение); `ymdz2` (заявка не найдена) (блок `Portal` `t2DLO`, подробности в `ui-design.md`); читать через mcp__pencil__execute/Get
- [x] 14.12 Прогнать тесты из 14.9 и `npx vitest run` в `portal`: green, регрессий нет
- [x] 14.13 Написать тесты на `QueuePage` (`useQueue`: пустое состояние, ошибка с повтором, название, автор и дата подачи, старые первыми, переход на `/requests/:id`) и `SkillsPage` (`useSkills`: список, фильтр «В разработке» показывает только такие навыки, смена статуса, 409), и убедиться, что раннер их видит
- [x] 14.14 Прогнать тесты из 14.13 и зафиксировать red: нет страниц
- [x] 14.15 Реализовать `QueuePage` (`/queue`) и `SkillsPage` (`/skills`). Фрейм в `design/synergy-design-kit.pen`: Node ID: `ewCKn`, `xvNFH` (очередь); `ZqbKp`, `OKW2d`, `JDRxT` (навыки) (блок `Portal` `t2DLO`, подробности в `ui-design.md`); читать через mcp__pencil__execute/Get
- [x] 14.16 Прогнать тесты из 14.13 и `npx vitest run` в `portal`: green, регрессий нет
- [x] 14.17 Написать тесты на маршрутизацию (`App`/`router`: все маршруты из architecture.md; `RequireAuth` на защищённых; `RequireRole('developer')` на `/queue` и `/skills`; прямой переход сотрудника без роли на `/queue` показывает «Мои заявки» и не вызывает запрос очереди; главная `/` ведёт на «Мои заявки»; неизвестный путь → `NotFoundPage`), и убедиться, что раннер их видит
- [x] 14.18 Прогнать тесты из 14.17 и зафиксировать red: нет роутера
- [x] 14.19 Реализовать роутер и `App` (`SessionProvider`, `QueryClientProvider`, маршруты) и `NotFoundPage` (`*`). `NotFoundPage` не содержит логики, это статичная вёрстка (текст и ссылка), отдельные тесты не заводятся, поведение маршрута покрыто тестом 14.17. Фрейм в `design/synergy-design-kit.pen`: Node ID см. `ui-design.md` (таблица «Экраны») — заполнить после согласования дизайна; читать через mcp__pencil__execute/Get
- [x] 14.20 Прогнать тесты из 14.17, `npx vitest run`, `npm run typecheck` и `npm run build` в `portal`: green, регрессий нет
- [x] 14.21 Проверить оформление и доступность по спеке `featurer-portal-ui` («Оформление и доступность»): работа анкеты и решения только клавиатурой, подписи полей, ошибки связаны с полями, ширина 360 px без горизонтальной прокрутки (скриншоты `mcp__plugin_playwright_playwright__browser_*` либо `mcp__extension__browser_*` на 360 px по каждой странице), тексты интерфейса на русском; сверить каждую страницу с её фреймом в `design/synergy-design-kit.pen` (Node ID см. `ui-design.md` (таблица «Экраны») — заполнить после согласования дизайна); проверка: список страниц со скриншотами и найденными расхождениями приложен к задаче, критичные расхождения исправлены

## 15. Интеграционная проверка и конфигурация

- [ ] 15.1 Настроить origin портала в `AUTH_ALLOWED_ORIGINS` (`backend/.env.example`, `backend/README.md`, локально `http://localhost:<vite-порт>`) и добавить тест/проверку конфигурации (`env.schema.spec.ts` или `origin.guard.spec.ts`: origin портала допускается cookie-эндпоинтами и CORS с `credentials: true`, чужой origin → 403); проверка: `npx vitest run src/modules/auth src/shared/config` зелёный, документированы требования к одному зарегистрированному домену по HTTPS (design.md п. 10)
- [ ] 15.2 Поднять стенд локально (миграции, `seed:users` с пользователем-разработчиком и обычным сотрудником, `seed:portal`, backend, `portal` через `npm run dev`) и убедиться: вход через портал ставит cookie `mh_refresh`, перезагрузка страницы восстанавливает сессию без пароля, выход отзывает сессию; проверка: пошаговая заметка с результатами (для входа использовать тестовых пользователей из `seed:users`)
- [ ] 15.3 Пройти сквозной сценарий критерия готовности Э0: сотрудник подаёт идею → разработчик принимает в новый навык → двигает статус `planned → in_dev → testing → launched` → автор видит статус в «Моих заявках» и получает уведомление на каждый шаг; проверка: автоматизированный прогон через браузерный MCP либо ручной с заметкой по каждому шагу (статус заявки, уведомление в `GET /notifications`), сверка с e2e из 7.9 и 8.9
- [ ] 15.4 Проверить вручную уведомление `request` в `control-center`: с настроенным `portalUrl` клик по уведомлению (список и всплывающее) помечает прочитанным и открывает заявку в браузере по умолчанию; без `portalUrl` — сообщение «портал недоступен»; клики по `task` и `chat` не изменились; проверка: заметка и скриншоты (электронное окно через `mcp__electron-stagewright__*` либо ручной запуск)
- [ ] 15.5 Проверить вручную уведомление `request` в `manager-helper`: боковая панель и системное уведомление при закрытой панели открывают заявку в новой вкладке, портал не настроен — сообщение в панели, сводное уведомление открывает список; манифест без новых разрешений; проверка: заметка по каждому сценарию
- [ ] 15.6 Проверить доставку в Telegram привязанному пользователю (по общему конвейеру, без отдельных настроек) и повторную обработку события (уведомление не дублируется); если Telegram недоступен на стенде, зафиксировать это и ссылаться на автоматический тест 8.9; проверка: заметка с результатом
- [ ] 15.7 Прогнать полный набор тестов и сборок: `backend` (`npx vitest run`, `npm run lint`, `npm run build`), `control-center` (`npx vitest run`, `npm run typecheck`), `manager-helper` (`npx vitest run`, `npm run typecheck`, `npm run lint`), `portal` (`npx vitest run`, `npm run typecheck`, `npm run build`); проверка: все команды зелёные, результат записан в заметке

## 16. Code review

- [ ] 16.1 Запустить code-review (скилл `code-review`) по всем изменениям фичи - от коммита, с которого начат change (хэш из задачи 1.1), до текущего HEAD: соответствие стандартам проекта и specs этого change
- [ ] 16.2 Исправить замечания ревью (блокирующие и существенные обязательно; остальные - исправить или явно отклонить с обоснованием), результат зафиксировать коммитом
- [ ] 16.3 Повторить code-review по правкам из 16.2 и убедиться, что блокирующих замечаний нет; прогнать тесты и зафиксировать, что они зелёные
