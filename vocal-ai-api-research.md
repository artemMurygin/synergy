# VocalAI (app.vocal-ai.ru) — исследование внутреннего API

Дата исследования: 2026-11-16.
Метод: перехват сетевых запросов браузера (Playwright) при ручной навигации по интерфейсу под залогиненным пользователем.

Публичного API нет — это внутренний REST API фронтенда (Ant Design SPA). Эндпоинты не версионированы (префикс `/api/`), ответы — JSON.

## ⚠️ Важно про безопасность перед реализацией агента

- Авторизация двухэтапная и завязана на SSO Синергии (Keycloak, `id.synergy.ru`). Процесс логина передаёт **логин/пароль пользователя в открытом виде** в теле POST-запроса — это стандартная форма логина, но значит, что для агента нужно either хранить реальные учётные данные пользователя Синергии в секретах, либо переиспользовать долгоживущий `refresh_token` Keycloak.
- Итоговый рабочий токен VocalAI (`accessToken` из `/api/auth/provider/synergy`) — **короткоживущий JWT (`expires_in` ≈ 1800 сек / 30 мин)**, HS256, payload содержит только `userId` и время истечения. Нужен механизм обновления через `refreshToken` (у refreshToken самого VocalAI срок жизни значительно больше — порядка полугода судя по `expiresIn`).
- Все данные (ФИО кандидатов/клиентов, транскрипты, email сотрудников, телефоны) — персональные/конфиденциальные. Хранить их в агенте нужно с учётом этого.
- Реальные значения токенов/пароля из сессии исследования в этот файл **не записаны** намеренно.

## Аутентификация

### Шаг 1. Логин через SSO Синергии (proxy)

```
POST /api/auth/proxy/synergy_login
Content-Type: application/json

{
  "username": "<login>@synergy.ru",
  "password": "<пароль>"
}
```

Ответ — токены Keycloak-реалма `clients` (`id.synergy.ru/auth/realms/clients`):

```json
{
  "access_token": "<JWT RS256, iss=https://id.synergy.ru/auth/realms/clients>",
  "expires_in": 3600,
  "refresh_token": "<JWT HS512>",
  "refresh_expires_in": 2678400,
  "token_type": "Bearer",
  "id_token": "<JWT RS256>",
  "session_state": "<uuid>",
  "scope": "openid email profile"
}
```

### Шаг 2. Обмен Keycloak-токена на токен VocalAI

```
POST /api/auth/provider/synergy
Content-Type: application/json

{ "code": "<access_token из шага 1>" }
```

Ответ:

```json
{
  "userInfo": {
    "id": 886,
    "fullName": "...",
    "email": "...@synergy.ru",
    "phone": "...",
    "isVerified": true,
    "avatar": { "urls": null|{"small","medium","large"}, "colorIndex": 6, "initials": "АМ" },
    "campaigns": [ { "id": 105, "title": "...", "ownerId": 2, "avatar": {...}, "permission": "VIEW|EDIT|ADMIN|OWNER" } ],
    "localStorage": {},
    "limitedAccess": []
  },
  "accessToken": "<JWT HS256 VocalAI, payload {userId, expires:1800, expiresIn:<unix>}>",
  "refreshToken": "<JWT HS256 VocalAI, долгоживущий>"
}
```

### Все дальнейшие запросы

```
Authorization: Bearer <accessToken из шага 2>
```

Обновление токена — вероятно отдельный эндпоинт `refresh` (не наблюдался в сессии, т.к. токен не истёк за время исследования); при реализации агента стоит перехватить/нащупать `POST /api/auth/.../refresh` либо просто повторять шаги 1–2 каждые ~25 минут.

## Общая иерархия сущностей

```
Campaign (аккаунт/кампания, "КД (КМВ)")
 └─ Space (пространство, "КД - Подбор персонала")
     └─ Project (проект/папка звонков, "Руководители")
         └─ Call (звонок)
             ├─ transcription[] (реплики)
             ├─ metricScore[] (оценки по чек-листу)
             ├─ summaries[] (AI-саммари по блокам)
             ├─ tags[] (теги с AI-классификацией)
             └─ fileInfo (аудиофайл, presigned S3 URL)
```

## Пользователь и аккаунт

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/user/me` | Текущий пользователь: id, ФИО, email, телефон, список `campaigns[]` с правами (`permission`: VIEW/EDIT/ADMIN/UPLOAD/LIMITED/OWNER) |
| GET | `/api/campaign/{campaignId}` | Карточка кампании/аккаунта: `title`, `balance` (копейки), `tariff` {`title`, `transcriptionPrice`, `scorePrice`, `aiFieldPrice`} |
| GET | `/api/teams/{campaignId}/members?` | Список участников кампании с правами (`permission`) и `limitedAccessProjects[]` |
| GET | `/api/notification/feed?limit=5&offset=0&only_unread=true` | Лента уведомлений: `{offset, limit, count, items[], unreadCount}` |

## Пространства (Spaces) и проекты

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/spaces/{campaignId}?sort=-date` | Список пространств кампании |
| GET | `/api/space/{spaceId}` | Карточка пространства |
| GET | `/api/projects/{spaceId}?sort=-date` | Список проектов внутри пространства (каждый с `totalCalls`, `userInfo` автора) |
| GET | `/api/project/{projectId}/` | Карточка проекта: `callFilters` (сохранённые фильтры), `activeMetrics[]` (метрики чек-листа с `metricScores` и `isSumScore`), `minMetricScore`/`maxMetricScore` |

## Звонки (Calls)

### Список звонков с фильтрами

```
POST /api/calls/project/{projectId}?limit=20&offset=0&with_total=false
Content-Type: application/json

{
  "managers": [],          // имена операторов (строки)
  "clients": [],           // имена клиентов
  "callTypes": [],         // "incoming" | "outgoing" | ...
  "marks": [],
  "startDate": "2026-11-01T00:00:00Z",
  "endDate": "2026-11-16T23:59:59.999999Z",
  "durationMin": null,
  "durationMax": null,
  "totalScoreMin": null,
  "totalScoreMax": null,
  "metricFilter": null,
  "metricIds": [],
  "tagFilter": null,
  "tagIds": [],
  "additionalFields": {},
  "fields1": [], "fields2": [], "fields3": [], "fields4": [], "fields5": [], "fields6": [],
  "fieldsAi": [],
  "projectIds": []
}
```

Ответ: `{offset, limit, currentCalls, totalCalls, items: Call[]}`, где `Call` — укороченная карточка звонка (без полной транскрипции, но с `metricScore[]`, `summaries[]`, `tags[]`, `totalScore`).

### Избранные звонки

`GET /api/calls/favorites` → `{"callIds":[...]}`

### Автокомплит значений для фильтров

```
GET /api/calls/{projectId}/project_fields?field=manager&limit=20&offset=0&q=
GET /api/calls/{projectId}/project_fields?field=client&limit=20&offset=0&q=
GET /api/calls/{projectId}/project_fields?field=additional_fields&limit=100&offset=0
```

Ответ: `{offset, limit, count, items: [{id, value}]}` — `id` и `value` совпадают (это строковые значения, не числовые ID).

### Карточка звонка (полная, с транскрипцией)

```
GET /api/call/{callId}?project_id={projectId}
```

Ключевые поля ответа:

| Поле | Тип | Описание |
|---|---|---|
| `manager`, `client` | string | ФИО оператора/клиента (как распознал AI, не привязаны к userId) |
| `callType` | string | `incoming` / др. |
| `fileInfo` | object | `{id, name, extension, file_url, duration_seconds, size_kb}` — `file_url` это **presigned S3 URL с TTL ~1 час** (`X-Amz-Expires=3600`), нужно получать заново при каждом скачивании |
| `managerSpeechSpeed`, `managerSpeechPart`, `clientSpeechSpeed`, `clientSpeechPart` | string(число) | Темп речи (слов/сек) и доля речи в % |
| `emotions` | object | `{angry, sad, neutral, positive}` — вероятности 0..1 |
| `isTranscription`, `isScored`, `transcriptionFailedAttempts` | bool/int | Статусы обработки |
| `scoredAt`, `rescoredAt` | datetime | |
| `transcription` | array | Реплики: `{id, speakerName, speakerRole: "manager"\|"client", startTime, endTime, formattedStartedTime, text}` |
| `metricScore` | array | По каждой активной метрике чек-листа: `{metricId, metricGroupId, scoreValue, maxScore, isSumScore, reason, recommendations, citations:[transcriptId...], isException}` |
| `summaries` | array | AI-саммари по предустановленным блокам: `{id, title, summary}` (напр. "Саммари звонка", "Оценка деловой игры", "Общие рекомендации руководителю") |
| `tags` | array | Присвоенные AI теги: `{id, title, prompt, values:[{id, value, description, color}]}` |
| `totalScore` | object | `{score, maxScore, color}` |
| `mistakes`, `recommendations`, `summary`, `groups` | | Легаси/альтернативные поля, в наблюдаемых звонках были `null`/`[]` (вероятно для старых проектов без чек-листов метрик) |

### Апелляции по звонку

```
GET /api/appeal/get_appeal_list?callId={callId}&limit=100&spaceId={spaceId}
```
→ `{offset, limit, count, items: []}` (механизм спора/пересмотра оценки, в наблюдаемых данных пуст).

### Аудиофайл

`fileInfo.file_url` — прямой GET на `https://s35-static.synergy.ru/vocal-ai/{uuid}.{ext}?X-Amz-...` (AWS S3 presigned URL, поддерживает `Range`-запросы, `Content-Type: application/octet-stream`). URL одноразово выдаётся при запросе карточки звонка и валиден ограниченное время — для скачивания аудио нужно сначала дёрнуть `/api/call/{id}`, затем сразу скачать по `file_url`.

## Метрики и чек-лист

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/metrics/group/list?projectId=` | Группы метрик (в наблюдаемом проекте — пусто, группировка не настроена) |
| GET | `/api/metrics/list?projectId=` | Полные определения метрик чек-листа: `title`, `description` (текст критериев оценки для LLM-промпта), `scores[]` (`{value, description}` — градации баллов), `minScore`, `maxScore`, `isSumScore`, `color`, `isActive`, `exceptions` |
| GET | `/api/checklist/settings?projectId=` | `{problemCallMode: "MISTAKES_SHARE", problemCallThreshold, problemCallUnit: "PERCENT"}` — правило определения "проблемных" звонков |

## Теги

`GET /api/tags/list?projectId=` → массив тегов:
```json
{
  "id": 554,
  "title": "Грубит",
  "type": "yes-or-no" | "single-choice" | "multiple-choice",
  "prompt": "<текст промпта для AI-классификации>",
  "values": [ {"id":..., "value":..., "description":..., "color":..., "position":..., "isActive":...} ],
  "isActive": true,
  "isVisibleToManager": true
}
```

## Аналитика / дашборд проекта

```
POST /api/analytics/project/dashboard?date_from=2026-11-01&date_to=2026-11-16&project_id=482&group_fields=field_1&group_fields=field_2&group_fields=field_3&group_fields=field_4&group_fields=field_5&group_fields=field_6&group_fields=field_ai
```
(Метод POST, но параметры и, вероятно, доп. фильтры — в query и/или body; в перехваченном вызове body не содержал данных фильтра звонков отдельно от query.)

Ответ — агрегированная витрина:
- `general`: `{totalCalls, averageScore, problemCalls, totalDuration}`
- `leaderboard[]`: по каждому оператору — `{manager, totalCalls, problemCalls, averageScore, totalDuration, groupScores}`
- `managers[]`: детальная раскладка по метрикам на оператора (`metrics[]`, `additionalFields`, `field1..field6`, `checklist`)
- `checklist[]`: средний % выполнения/ошибок по каждой метрике чек-листа в целом по проекту
- `averageScores[]`, `managersAverageScores[]`: динамика по датам
- `problemCall`: правило определения проблемного звонка (дублирует `/checklist/settings`)

Экспорт таблицы "Аналитика звонков операторов" в xlsx доступен кнопкой "Скачать xlsx" в UI — отдельный эндпоинт не перехвачен (не кликали), вероятно `GET /api/analytics/project/.../export` или аналог, отдающий файл напрямую.

## Интеграции / вебхуки

`GET /api/webhook/list?project_id={projectId}` → `[]` (в исследуемом проекте вебхуки не настроены; предполагается CRUD `/api/webhook/...` для создания и управления).

## Аватары

`GET /api/avatar/user/{userId}/{hash}/{64|128|256}.webp` — статичные картинки, публичный путь без доп. авторизации в URL (но домен за тем же origin).

## Не исследовано (требует отдельного прохода)

- Эндпоинт обновления access-токена (`refresh`).
- Загрузка нового звонка (кнопка "Загрузить" в списке звонков — вероятно `POST /api/calls/upload` или аналог с multipart/presigned-upload в S3).
- Экспорт отчётов в xlsx (конкретный путь не пойман).
- Создание/редактирование метрик, тегов, вебхуков (CRUD, в сессии были только GET).
- Эндпоинт логаута / инвалидации токена.
- Страница "Чек-лист" → вкладка выбора метрик по умолчанию (`/check-list/metrics`) — список самих вызовов собран (`/api/metrics/list`, `/api/checklist/settings`), но не изучены мутации (создание метрики).
- Раздел "Баланс" кампании — пополнение баланса (платёжный флоу).

## Рекомендации для реализации агента/тулов

1. **Аутентификация**: реализовать клиент с храненим `accessToken` (VocalAI) + временем истечения, авто-обновление через повторный логин по SSO при истечении (или найти реальный `refresh`-эндпоинт перед продом).
2. **Обязательные контекстные ID**: большинство запросов требуют `campaignId` → `spaceId` → `projectId`, их нужно резолвить через `/api/user/me` → `campaigns[]` → `/api/spaces/{campaignId}` → `/api/projects/{spaceId}`.
3. **Инструмент "получить звонки"**: обернуть `POST /api/calls/project/{projectId}` с фильтрами по датам/менеджеру/тегу/оценке — это основной источник данных для агента.
4. **Инструмент "получить карточку звонка"**: `GET /api/call/{callId}?project_id=` — отдаёт транскрипцию целиком, этого обычно достаточно без скачивания аудио.
5. **Аудио** скачивать только по требованию (дорого по трафику), помня о TTL presigned-URL.
6. Хранить пароль/токены пользователя вне кода, через секрет-менеджер — в теле запроса `synergy_login` пароль передаётся в открытом виде по HTTPS, это ожидаемо для формы логина, но исключает его логирование где-либо.
