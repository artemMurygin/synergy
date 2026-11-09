# sheets-qa

Прототип: Deep Agent отвечает на вопросы абитуриентов и студентов, читая выгруженную книгу `ЦП.xlsx` через инструменты. Чаты и их история хранятся в PostgreSQL (`POSTGRES_URL`).

## Как пользоваться

1. Положите книгу в `data/tables/ЦП.xlsx` (содержимое папки не коммитится). Заменили файл — агент увидит новые данные при следующем вопросе.
2. Структура книги описана в `data/tables/ЦП.md` (рядом с книгой), подробные описания листов — в `data/tables/ЦП/<лист>.md`. `data/catalog.md` кратко говорит агенту о книге и указывает на `ЦП.md`; он подставляется в системный промпт на каждый вопрос. Агент читает описания по запросу инструментом `read_sheet_guide`, поэтому лишнее в контекст не попадает.
3. Запустите бэкенд из папки `backend`, создайте чат и задайте вопрос (ответ приходит потоком SSE):
   `curl -X POST localhost:1234/threads` (в ответе `id` чата), затем
   `curl -N -X POST localhost:1234/agent -H 'content-type: application/json' -d '{"threadId":"<id>","runId":"<любая строка>","messages":[{"id":"m1","role":"user","content":"Сколько стоит Лечебное дело?"}],"tools":[],"context":[],"state":{},"forwardedProps":{}}'`

## Чаты и контекст агента

- Чаты (`chat_session`) и история сообщений для UI (`chat_message`) создаёт наша миграция `db/migrations/012_chat_sessions.sql`.
- Контекст агента (`thread_id` = id чата) хранит `PostgresSaver` из `@langchain/langgraph-checkpoint-postgres` на том же `POSTGRES_URL`. Его таблицы (`checkpoints`, `checkpoint_blobs`, `checkpoint_writes`, `checkpoint_migrations`) создаёт сама библиотека вызовом `setup()` при старте модуля, после `migrate()`. В наших миграциях их нет: не добавляйте их туда и не удаляйте вручную. Контекст переживает перезапуск бэкенда; при удалении чата thread удаляется через `PostgresChatThread`.

## HTTP-маршруты

- `POST /agent` — запуск агента по протоколу AG-UI (`RunAgentInput`: `threadId`, `runId`, `messages`). Новым вопросом считается последнее сообщение пользователя, история берётся из чекпойнта. Ответ — `text/event-stream`. 400 — неверное тело или пустой/слишком длинный вопрос, 404 — неизвестный чат, 409 — в чате уже идёт запуск.
- `POST /threads` (создать), `GET /threads` (список, у каждого чата есть `running`), `GET /threads/:id/messages` (сообщения в формате AG-UI и `running`), `PATCH /threads/:id` (переименовать), `DELETE /threads/:id` (204; сначала отменяет активный запуск), `POST /threads/:id/run/cancel` (204; идемпотентна, без активного запуска ничего не делает). Неизвестный чат даёт 404. Старых маршрутов `/sheets-qa/ask` и `/chat-sessions` нет.

## События AG-UI

Поток запуска: `RUN_STARTED`, затем по ходу работы `TEXT_MESSAGE_START` / `TEXT_MESSAGE_CONTENT` / `TEXT_MESSAGE_END` для текста ответа, `TOOL_CALL_START` / `TOOL_CALL_ARGS` / `TOOL_CALL_END` / `TOOL_CALL_RESULT` для вызовов инструментов, и ровно одно терминальное событие: `RUN_FINISHED` (успех; при отмене — с `outcome: cancelled`) или `RUN_ERROR` (ошибка агента, таймаут). Преобразование внутренних событий агента в AG-UI — `interface/http/ag-ui-event-mapper.ts`.

## Закрытие соединения и отмена

- Запуск живёт независимо от соединения: если клиент закрыл `/agent` (вкладка, обрыв сети), агент продолжает работать, а ответ сохраняется в историю. После завершения `GET /threads/:id/messages` содержит ответ и `running: false`; пока запуск идёт, `running: true`. Подключиться к идущему запуску нельзя, клиент опрашивает историю.
- Остановить запуск можно только явно: `POST /threads/:id/run/cancel`. Отмена прерывает агента, запуск завершается как отменённый, чат освобождается для следующего вопроса.
- Активные запуски хранятся в памяти процесса (`InMemoryActiveRunRegistry`, по одному на чат). При graceful shutdown (`ActiveRunsLifecycle`) все активные запуски отменяются; при падении процесса запуск теряется, а `running` сбрасывается.

## Настройки

В `sheets-qa.config.ts`: модель, пути, лимиты, раскладка листов (`SHEET_LAYOUTS`: строки шапки, первая строка данных, скрытые колонки), исключения для связей (`RELATION_OVERRIDES`). Ключ и адрес модели (`OPENAI_API_KEY`, `OPENAI_BASE_URL`) берутся из env.

## Инструменты агента (только чтение)

`read_sheet_guide` (структура книги и описания листов), `list_sheets`, `search_cells` (несколько запросов за вызов), `read_rows` (с подписями колонок из шапки и секцией — факультетом), `get_row_links`, `find_related` (связи прайсов СПО, БАКСПЦ, МАГ, АСПОРД, МТИ, МАП, ЮФУБГИСПИГ с их листами «МБ …» и «МБ квалификация» по гиперссылкам книги, которые читаются из XML; правила — `LINK_RELATIONS` в конфиге: целевой лист, блок строк, колонки названия для проверки; ссылка на программу с другим названием возвращается с пометкой `link target has a different name; verify`; для СПО без ссылки — сопоставление по названиям с пометкой `matched by names`).

## Структура

- `domain/ports` — порты ассистента и ридера книги.
- `application` — `StartAgentRunUseCase`, `CancelAgentRunUseCase`, use case'ы чатов, фабрика инструментов.
- `infrastructure` — `ExcelJsWorkbookReader`, сопоставление по названиям, Deep Agent, системный промпт.
- `interface/http` — `AgentController` (`POST /agent`, SSE AG-UI), `ThreadsController` (`/threads`).

## Как добавить лист

Создайте `data/tables/ЦП/<название листа>.md`, добавьте строку в таблицу `data/tables/ЦП.md` и, если у листа многоуровневая шапка, раскладку в `SHEET_LAYOUTS`.
