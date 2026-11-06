# sheets-qa

Прототип: Deep Agent отвечает на вопросы абитуриентов и студентов, читая выгруженную книгу `ЦП.xlsx` через инструменты. Чаты и их история хранятся в PostgreSQL (`POSTGRES_URL`).

## Как пользоваться

1. Положите книгу в `data/tables/ЦП.xlsx` (содержимое папки не коммитится). Заменили файл — агент увидит новые данные при следующем вопросе.
2. Структура книги описана в `data/tables/ЦП.md` (рядом с книгой), подробные описания листов — в `data/tables/ЦП/<лист>.md`. `data/catalog.md` кратко говорит агенту о книге и указывает на `ЦП.md`; он подставляется в системный промпт на каждый вопрос. Агент читает описания по запросу инструментом `read_sheet_guide`, поэтому лишнее в контекст не попадает.
3. Запустите бэкенд из папки `backend` и задайте вопрос:
   `curl -X POST localhost:3000/sheets-qa/ask -H 'content-type: application/json' -d '{"question":"Сколько стоит Лечебное дело?","sessionId":"<id из POST /chat-sessions>"}'`

## Чаты и контекст агента

- Чаты (`chat_session`) и история сообщений для UI (`chat_message`) создаёт наша миграция `db/migrations/012_chat_sessions.sql`.
- Контекст агента (`thread_id` = id чата) хранит `PostgresSaver` из `@langchain/langgraph-checkpoint-postgres` на том же `POSTGRES_URL`. Его таблицы (`checkpoints`, `checkpoint_blobs`, `checkpoint_writes`, `checkpoint_migrations`) создаёт сама библиотека вызовом `setup()` при старте модуля, после `migrate()`. В наших миграциях их нет: не добавляйте их туда и не удаляйте вручную. Контекст переживает перезапуск бэкенда; при удалении чата thread удаляется через `PostgresChatThread`.
- `POST /sheets-qa/ask` принимает `{question, sessionId}`; для неизвестной сессии отвечает 404. Сессии: `POST/GET /chat-sessions`, `GET /chat-sessions/:id/messages`, `PATCH /chat-sessions/:id`, `DELETE /chat-sessions/:id` (204).

## Настройки

В `sheets-qa.config.ts`: модель, пути, лимиты, раскладка листов (`SHEET_LAYOUTS`: строки шапки, первая строка данных, скрытые колонки), исключения для связей (`RELATION_OVERRIDES`). Ключ и адрес модели (`OPENAI_API_KEY`, `OPENAI_BASE_URL`) берутся из env.

## Инструменты агента (только чтение)

`read_sheet_guide` (структура книги и описания листов), `list_sheets`, `search_cells` (несколько запросов за вызов), `read_rows` (с подписями колонок из шапки и секцией — факультетом), `get_row_links`, `find_related` (связи прайсов СПО, БАКСПЦ, МАГ, АСПОРД, МТИ, МАП, ЮФУБГИСПИГ с их листами «МБ …» и «МБ квалификация» по гиперссылкам книги, которые читаются из XML; правила — `LINK_RELATIONS` в конфиге: целевой лист, блок строк, колонки названия для проверки; ссылка на программу с другим названием возвращается с пометкой `link target has a different name; verify`; для СПО без ссылки — сопоставление по названиям с пометкой `matched by names`).

## Структура

- `domain/ports` — порты ассистента и ридера книги.
- `application` — `AskQuestionUseCase`, фабрика инструментов.
- `infrastructure` — `ExcelJsWorkbookReader`, сопоставление по названиям, Deep Agent, системный промпт.
- `interface/http` — `POST /sheets-qa/ask`, `/chat-sessions`.

## Как добавить лист

Создайте `data/tables/ЦП/<название листа>.md`, добавьте строку в таблицу `data/tables/ЦП.md` и, если у листа многоуровневая шапка, раскладку в `SHEET_LAYOUTS`.
