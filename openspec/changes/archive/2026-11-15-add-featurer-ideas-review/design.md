## Context

Мотивация — в proposal.md (раздел Why), требования — в `specs/`. Ниже только то, что влияет на реализацию.

- Модуль `backend/src/modules/portal` после Э0–Э2. `IdeaRequest` — агрегат с `accept`/`reject`, оба проверяют `decision.kind === 'pending'`. `RequestDecision` — размеченное объединение `pending | accepted | rejected`.
- Таблица `portal_requests` (миграция 029): `decision IN ('pending','accepted','rejected')`, CHECK-инварианты «принята ⇔ есть `skill_id`», «отклонена ⇔ есть причина», частичный индекс очереди `WHERE decision = 'pending'`.
- Конкурентность решения: `SlonikRequestRepository.save` делает условный `UPDATE … WHERE decision = 'pending'`. 0 строк превращается в `RequestAlreadyDecidedError`. Заявка читается без блокировки (`findById`).
- `AcceptRequestUseCase` в одной транзакции разрешает цель (`{skillId}` или `{agentId,name,description}`), создаёт навык, сохраняет заявку и публикует `RequestAcceptedEvent`. Агент читается `findAgentForShare`, навык — `findForUpdate`.
- `CatalogRepository` умеет только читать агентов, менять `archived_at` и сидировать (`ON CONFLICT DO NOTHING` по `slug`). Создания агента и продукта вне сидера нет. Уникальны только `slug`, названия — нет.
- `RequestStatusPolicy` — единственное место вывода статуса для автора. Код `pending` и подпись «На рассмотрении» использует портал (`lib/status-labels.ts`, Zod-схема `IdeaRequest`).
- Уведомления: `RequestDecidedSubscriber` + `RequestDecisionRule` в `notifications`. Имя разработчика берётся из `UserDirectoryPort.findLoginById`. Цель `request` у уведомлений уже есть.
- Портал: `features/decision/DecisionPanel` (переключатель «Принять/Отклонить», `SkillPicker` с режимами `existing`/`new`), `QueuePage`, `RequestPage`, `features/requests` (подписи и бейдж статуса). Список продуктов уже приходит в `GET /portal/catalog`, вместе с продуктами без агентов.
- Библиотеки транслитерации в зависимостях бэкенда нет.

## Goals / Non-Goals

**Goals:**
- Жизненный цикл заявки — одна таблица переходов в домене. Все записи статуса условные по ожидаемому статусу, гонки дают 409, а не потерянное обновление.
- Принятие с любым набором новых сущностей (продукт, агент, навык) — одна транзакция в одном use-case.
- Уникальность названий и `slug` гарантирует БД, а не только проверка в коде.
- Портал не дублирует правило «что можно делать с заявкой»: действия строятся по статусу из ответа.

**Non-Goals:**
- Возврат заявки в `new`, переназначение, «снять с себя».
- Редактирование оценки после принятия и оценка для отклонённых заявок.
- Ручной CRUD продуктов и агентов, переименование, слияние дублей.
- Расчёт экономии в рублях и сравнение оценки с экономией (Э8).
- Глубокие ссылки из уведомлений в клиенты (Э4).

## Decisions

### 1. Статус заявки — колонка `decision` с четырьмя значениями, `pending` переименовывается в `new`

Миграция 035 переводит `decision` в набор `('new','under_review','accepted','rejected')`, существующие `pending` становятся `new`. Добавляются колонки `reviewer_id UUID REFERENCES auth_users`, `taken_at TIMESTAMPTZ`, `effort_hours INTEGER`. Инварианты в CHECK:
- `(decision = 'new') = (reviewer_id IS NULL)` и `(reviewer_id IS NULL) = (taken_at IS NULL)`: у всех заявок, кроме новых, есть взявший;
- `CHECK (decision = 'accepted' OR effort_hours IS NULL)` и `CHECK (effort_hours IS NULL OR effort_hours > 0)`: оценка бывает только у принятых.

Обязательность оценки при новом принятии держат домен и схема запроса, а не БД. Причина — заявки, решённые до миграции: в Э0–Э2 решение принималось без взятия и без оценки. Миграция заполняет им `reviewer_id := decided_by` и `taken_at := decided_at`, а `effort_hours` у принятых остаётся `NULL`. В ответе API у таких заявок `effortHours: null`, портал показывает «—».

Частичный индекс очереди пересоздаётся `WHERE decision IN ('new','under_review')`.

- *Почему переименовать, а не оставить `pending`:* в API и на портале появляются два «нерешённых» статуса. `pending` рядом с `under_review` читается двусмысленно, а Э0–Э2 ещё не открыты сотрудникам, внешних потребителей нет.
- *Альтернатива:* отдельная колонка `review_state` поверх `decision`. Отвергнута: два поля дают недопустимые сочетания (`accepted` + `new`), которые пришлось бы запрещать дополнительными CHECK.

### 2. Домен: `RequestDecision` получает вариант `under_review`, переходы — в агрегате

`RequestDecision` становится `new | under_review{reviewerId, takenAt} | accepted{reviewerId, takenAt, skillId, effortHours, decidedBy, decidedAt} | rejected{reviewerId, takenAt, reason, decidedBy, decidedAt}`. Взявший переносится в решённые варианты, чтобы его не терять. У старых решённых заявок `reviewerId` заполнен миграцией, `effortHours` допускает `null` только при `restore`.

Методы `IdeaRequest`:
- `take(by, now)` — только из `new`. Из `under_review` — новая `RequestAlreadyTakenError` (`PORTAL_REQUEST_ALREADY_TAKEN` → 409), из решённой — существующая `RequestAlreadyDecidedError` (409).
- `accept(skillId, effort, by, now)` и `reject(reason, by, now)` — только из `under_review`. Из `new` — новая `RequestNotTakenError` (`PORTAL_REQUEST_NOT_TAKEN` → 409), из решённой — `RequestAlreadyDecidedError`.

Оценка — value object `EffortHours.of(n)`: целое, `1..MAX_EFFORT_HOURS` (2000, около года работы одного человека), иначе `ArgumentInvalidError` → 400.

`RequestStatusPolicy.statusOf` возвращает коды `new` («Новая») и `under_review` («На рассмотрении»). Тип `RequestStatusCode = 'new' | 'under_review' | 'rejected' | SkillStatus`.

- *Почему решение только из `under_review`:* так совпадает модель роадмапа, и у каждой решённой заявки есть «кто смотрел». Цена — лишний клик для очевидного отказа. Кнопка «Взять в работу» на портале стоит там же, где потом появится панель решения, поэтому лишний клик не требует перехода.
- *Почему решать может любой разработчик:* иначе заявка зависает, если взявший в отпуске, а переназначения в Э3 нет.

### 3. Конкурентность — условные `UPDATE` по ожидаемому статусу

`RequestRepository.save(request, expected: RequestStatusKind)` обновляет строку `WHERE id = … AND decision = expected`. 0 строк превращаются в ошибку по фактическому статусу: повторное чтение решает, что это — `RequestAlreadyTaken` или `RequestAlreadyDecided`. Use-case'ы передают `expected`: `take` — `new`, `accept`/`reject` — `under_review`. Так закрываются «два разработчика взяли одновременно» и «приняли и отклонили одновременно» без `SELECT … FOR UPDATE`. Тот же приём уже используется для статуса навыка.

### 4. Принятие: цель — размеченное объединение из трёх вариантов

Тело `POST /portal/requests/:id/accept`:

```
{ effortHours: number,
  target:
    | { kind: 'existing_skill', skillId }
    | { kind: 'new_skill', agentId, name, description }
    | { kind: 'new_agent', agent: { name, productIds: uuid[], newProduct?: { name } },
                           skill: { name, description } } }
```

Zod: `z.discriminatedUnion('kind', …)`, а у `new_agent` — `refine(productIds.length > 0 || newProduct)` → 400. **BREAKING** для тела запроса: старые варианты `{skillId}` и `{agentId,…}` верхнего уровня не принимаются, портал обновляется в том же change.

`AcceptRequestUseCase.resolveSkill` получает третью ветку, общий порядок внутри транзакции такой:
1. Заявка: `findById`, `request.accept(...)` проверяет статус до записей в каталог (быстрый 409 без побочных вставок; окончательную гарантию даёт условный `save`).
2. Для `new_agent`: проверить продукты из `productIds` (`findProductsByIds`, нехватка → `ProductNotFoundError`, `PORTAL_PRODUCT_NOT_FOUND` → 404) → при `newProduct` создать продукт → создать агента со связями → создать навык.
3. `requests.save(request, 'under_review')`, публикация `RequestAcceptedEvent` с `effortHours`.

Ошибка на любом шаге откатывает транзакцию целиком.

- *Почему discriminated union с `kind`, а не `z.union` по форме:* три варианта с пересекающимися полями (`name`, `description`) по форме различаются хрупко. Явный `kind` также даёт понятную ветку в портале.
- *Альтернатива:* отдельные эндпоинты `POST /portal/agents` и `POST /portal/products` и затем принятие. Отвергнута: роадмап запрещает ручной CRUD каталога, а несколько запросов теряют атомарность («продукт создан, принятие упало»).

### 5. `slug` — собственный транслитератор в домене, уникальность — в БД с повтором

`domain/slug.ts`: `Slug.fromName(name, fallback)` — таблица транслитерации кириллицы (упрощённая ГОСТ 7.79-2000 Б без диакритики: `ж→zh`, `х→kh`, `ц→ts`, `ч→ch`, `ш→sh`, `щ→shch`, `ю→yu`, `я→ya`, `ъ/ь→''`, `й→y`, `ё→e`), lower-case, `[^a-z0-9]+ → '-'`, обрезка краёв, усечение до `MAX_SLUG_LENGTH` (64) с запасом под суффикс. Чистая функция, покрывается юнит-тестами.

Выбор свободного варианта делает репозиторий: `CatalogRepository.nextFreeSlug(kind, base)` читает `slug` вида `base` и `base-N` одним запросом (`slug = $base OR slug ~ ('^' || $base || '-[0-9]+$')`) и возвращает первый свободный. Гонку двух вставок с одним `slug` ловит существующий `UNIQUE (slug)`: unique violation по индексу `slug` повторяет подбор (до 3 попыток) в savepoint'е, а не валит транзакцию.

- *Почему не библиотека `slugify`/`transliteration`:* нужна одна таблица на ~33 буквы. Зависимость ради неё не окупается, а правило должно быть детерминированным и проверяться тестами домена.
- *Почему суффикс, а не 409:* `slug` технический, пользователь его не вводит и не видит в форме. Конфликт по `slug` при уникальном названии не означает, что запись дублируется («Веб 2.0» и «Веб-2-0»).

### 6. Уникальность названий — функциональные уникальные индексы

`CREATE UNIQUE INDEX portal_agents_name_uq ON portal_agents (lower(btrim(name)))`, то же для `portal_products`. Use-case сначала проверяет `findAgentByName`/`findProductByName` (понятный 409 до вставки). Гонку закрывает индекс: репозиторий переводит unique violation по этим индексам в `AgentNameTakenError` / `ProductNameTakenError` (коды `PORTAL_AGENT_NAME_TAKEN`, `PORTAL_PRODUCT_NAME_TAKEN` → 409, сообщение «агент с таким названием уже есть» / «продукт с таким названием уже есть»). Транзакция откатывается целиком, заявка остаётся `under_review`.

Сидер: вставка агента и продукта идёт с `ON CONFLICT DO NOTHING` без указания цели, поэтому конфликт и по `slug`, и по названию пропускает запись. Для пропуска по названию (запись с этим `slug` не появилась, а название занято другой) сидер пишет предупреждение в вывод CLI.

- *Альтернатива:* `citext`. Отвергнута: ради двух колонок понадобилось бы расширение, а `btrim` при сравнении всё равно нужен.

### 7. Событие взятия и уведомление `request.under-review`

`contracts/request-taken.event.ts`: `RequestTakenEvent` (`portal.request_taken`), payload `{ authorId, reviewerId, requestTitle }`, регистрируется в `register-portal-events.ts`. В `notifications`: `RequestTakenRule` (не применяется, если `authorId === reviewerId`) и `RequestTakenSubscriber`. Имя взявшего: в `UserDirectoryPort` добавляется `findFullNameById` (ФИО по правилам `employee-directory`, без ФИО — логин), адаптер переиспользует тот же SQL, что и read-модель заявки. Тип `request.under-review` добавляется в `NotificationType`. Доставка в Telegram идёт без изменений: канал работает по всем типам.

`RequestAcceptedEvent` получает `effortHours`. В схеме payload поле `optional()`, чтобы события, уже лежащие в outbox до выката, продолжали разбираться. Текст уведомления о принятии оценку не показывает: она нужна на экране заявки, а не в сообщении.

- *Почему имя, а не логин, как в существующих правилах:* после Э1 у сотрудников есть ФИО, и портал везде показывает полное имя. Существующие правила (`request.accepted` и другие) на имя здесь не переводятся, это отдельная правка.

### 8. API и read-модель

- `POST /portal/requests/:id/take` (`@Roles('developer')`, 200, `RequestResponse`; 404, 409).
- `RequestView`/`RequestResponse` получают `reviewer: { id, login, fullName } | null`, `takenAt: string | null`, `effortHours: number | null`. Код статуса `pending` исчезает, появляются `new` и `under_review`.
- `GET /portal/queue` возвращает `new` и `under_review` (`ORDER BY created_at`).
- Ответы `featurer-catalog` не меняются. Новые агенты и продукты попадают в `GET /portal/catalog` и `GET /portal/agents` автоматически.

### 9. Портал: действия по статусу из ответа

- `RequestPage` для разработчика: `status.code === 'new'` → блок «Взять в работу» (`useTakeRequest`, при 409 инвалидирует заявку и очередь). `under_review` → `DecisionPanel`. Решённые → только просмотр.
- `DecisionPanel`: поле «Оценка, ч» над переключателем Принять/Отклонить, видно только в режиме «Принять». `SkillPicker` получает третий режим `new_agent` (название агента, мультивыбор продуктов из `useCatalog().products`, поле «Новый продукт»). Валидация до отправки — в `toTarget`, по правилам спеки. Тип `AcceptTarget` перестраивается под `kind`.
- Ошибки 409 различаются по `code` из тела ответа (`PORTAL_REQUEST_ALREADY_DECIDED`, `PORTAL_REQUEST_ALREADY_TAKEN`, `PORTAL_REQUEST_NOT_TAKEN`, `PORTAL_SKILL_ARCHIVED`/`PORTAL_AGENT_ARCHIVED`, `PORTAL_AGENT_NAME_TAKEN`/`PORTAL_PRODUCT_NAME_TAKEN`), а не по тексту сообщения.
- `lib/status-labels.ts` и Zod-схема: коды `new`/`under_review`, поля `reviewer`, `takenAt`, `effortHours`.

## Risks / Trade-offs

- [В данных уже есть агенты или продукты с одинаковыми названиями без учёта регистра → создание уникального индекса в миграции 035 упадёт] → в миграции перед индексами стоит проверочный `DO $$ … RAISE EXCEPTION` с перечнем дублей. Сейчас данные — только сидер и демо-сид, в них дублей нет, но на стенде перед выкатом нужно выполнить проверочный запрос.
- [Переименование `pending` → `new` ломает клиент, развёрнутый раньше бэкенда] → портал и бэкенд выкатываются вместе. Других потребителей `/portal/*` нет (manager-helper и control-center получают только уведомления).
- [У принятых до миграции заявок нет оценки] → `effortHours: null` допустим в ответе, CHECK обязательности не накладывается. Портал показывает «—».
- [Разработчик создаёт агента, который почти дублирует существующий («Сверщик актов» и «Сверка актов»)] → уникальность ловит только точное совпадение. Защита — список существующих агентов в том же выпадающем выборе, разбор дублей вручную через архив.
- [Решение только из `under_review` добавляет клик к очевидному отказу] → принимаем ради простой модели. Если будет мешать, можно добавить «взять и отклонить» одной кнопкой на портале поверх тех же двух запросов.
- [Подбор свободного `slug` по регулярному выражению на больших таблицах] → таблицы агентов и продуктов — десятки строк, производительность не критична.

## Migration Plan

1. Выполнить проверочный запрос на дубли названий агентов и продуктов. При непустом результате переименовать дубли вручную до выката (миграция 035 иначе прервётся с `RAISE EXCEPTION`):

   ```sql
   SELECT 'agent' AS kind, lower(btrim(name)) AS key, count(*) AS duplicates
   FROM portal_agents GROUP BY lower(btrim(name)) HAVING count(*) > 1
   UNION ALL
   SELECT 'product', lower(btrim(name)), count(*)
   FROM portal_products GROUP BY lower(btrim(name)) HAVING count(*) > 1;
   ```
2. Миграция 035 (одна транзакция): снять старые CHECK `decision`, `UPDATE decision = 'new' WHERE decision = 'pending'`, добавить колонки, заполнить `reviewer_id`/`taken_at` у решённых из `decided_by`/`decided_at`, новые CHECK, пересоздать индекс очереди, уникальные индексы названий.
3. Выкатить бэкенд и портал одновременно. Зарегистрировать новый тип события до запуска outbox-воркера (он регистрируется при старте модуля).
4. Откат: обратная миграция — `DROP INDEX` названий, `UPDATE decision = 'pending' WHERE decision IN ('new','under_review')`, удалить колонки, вернуть CHECK и индекс. Взятия в работу и оценки при откате теряются, решения сохраняются. Невыданные события `portal.request_taken` в outbox помечаются обработанными вручную.
