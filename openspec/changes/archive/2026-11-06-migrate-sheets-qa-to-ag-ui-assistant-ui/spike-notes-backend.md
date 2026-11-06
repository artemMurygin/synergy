# Заметки backend-спайков

## 1.1 Зависимости AG-UI

В `backend/package.json` добавлены точные версии `@ag-ui/core@1.0.4` и `@ag-ui/encoder@1.0.4`. `npm install` и `npm run typecheck` проходят; `require` обоих пакетов и `EventEncoder.encodeSSE` работают (строка `data: {...}\n\n`).

## 1.3 Поток `streamEvents` v2 у `createDeepAgent`

Скрипт: `backend/scripts/record-stream-events.mjs` (`node scripts/record-stream-events.mjs`). Фейковая модель отдаёт заранее заданные чанки в стриме, как провайдер. Один инструмент `lookup` и один субагент `searcher` (со своей фейковой моделью). Сценарий: основной агент пишет «Сейчас проверю. » и вызывает `task(searcher)`, субагент вызывает `lookup` и отвечает текстом, основной агент пишет финальный ответ. Записанный поток (66 событий) лежит в `backend/src/modules/sheets-qa/infrastructure/testing/stream-events.fixture.json`.

### Какие события что несут

| Что нужно | Событие | Где данные |
|---|---|---|
| Текстовый фрагмент | `on_chat_model_stream` | `data.chunk.kwargs.content` (строка; у реальных провайдеров может быть массив частей `{type:'text', text}`, как в `textOf`); пустая строка у чанков с вызовом инструмента |
| Начало вызова инструмента (id, имя, аргументы) | `on_chat_model_end` | `data.output.kwargs.tool_calls[]` = `{id, name, args}` с готовым `args`-объектом. Заранее id и имя приходят в первом чанке `on_chat_model_stream` (`tool_call_chunks[0].id/name`), аргументы стримятся кусками JSON |
| Фактический старт выполнения инструмента | `on_tool_start` | `name`, `data.input` (аргументы). `tool_call_id` в этом событии НЕТ |
| Конец вызова инструмента | `on_tool_end` | У обычного инструмента `data.output.kwargs.tool_call_id` (ToolMessage). У `task` `data.output` это `Command`: id в `data.output.update.messages[0].kwargs.tool_call_id` |
| Результат инструмента | `on_tool_end` | `data.output...content`; наружу как текст не отдавать |
| Событие субагента | те же события | `metadata.lc_agent_name` = имя субагента (`searcher`), `metadata.checkpoint_ns` содержит `|` (вложенный граф). У основного агента `lc_agent_name` нет, `checkpoint_ns` без `|` |
| Сам вызов субагента | `on_tool_start`/`on_tool_end` с `name: 'task'`, `data.input` = `{description, subagent_type}` | дальше идут `on_chain_start`/`on_chain_end` с `name` = имя субагента |

Поля `parent_ids` в событиях нет. Различать верхний уровень и субагента нужно по `metadata.lc_agent_name`/`checkpoint_ns`.

### Выводы для `mapStreamEvent` (задача 4.3)

- Текст отдавать из `on_chat_model_stream` только верхнеуровневого агента (без `lc_agent_name`); текст субагента идёт в его `task`-результат и в итоговый ответ основного агента не должен дублироваться.
- `callId` брать из `on_chat_model_end.tool_calls[].id`; `tool-call-started` строить там же (имя и аргументы уже собраны). `on_tool_start` не содержит id, поэтому по нему id не получить; сопоставление с `on_tool_end` идёт по `tool_call_id`.
- Вызов `task` и вызовы инструментов внутри субагента приходят одним потоком; вызовы субагента помечаются по `lc_agent_name`.
- В состоянии на `on_chain_*` лежит вся история (фикстура 120 КБ из-за этого); для маппинга нужны только `on_chat_model_*` и `on_tool_end`.
- Служебные события (`on_chain_*`, middleware `FilesystemMiddleware`, `patchToolCallsMiddleware`, `parentNotifierMiddleware`) игнорируются.
- Ограничение фикстуры: записана на фейковой модели, а не на реальном провайдере; формат `content` у OpenRouter (массив частей, `cache_control`) в ней не воспроизведён.
