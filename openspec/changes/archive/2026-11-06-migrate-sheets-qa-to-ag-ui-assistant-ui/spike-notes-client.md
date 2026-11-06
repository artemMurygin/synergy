# Заметки по прототипу клиента (задачи 1.2 и 1.4)

## 1.2 Зависимости и размер бандла

Добавлены в `manager-helper` с точными версиями (без `^`):

- `@ag-ui/client` 1.0.4 (тянет `@ag-ui/core`, `@ag-ui/encoder`, `@ag-ui/proto` 1.0.4 и `rxjs` 7.8.1)
- `@assistant-ui/react` 0.15.32
- `@assistant-ui/react-ag-ui` 0.1.1

`npm run build` проходит (typecheck + vite build), `npm run lint` и `npm test` (85 тестов) без регрессий.

Размер бандла side panel (чанк `index.html-*.js`, общий чанк `jsx-runtime-*.js` не меняется):

| Состояние | Чанк side panel | gzip |
| --- | --- | --- |
| До (эталон) | 192,69 kB | 58,95 kB |
| С временным импортом `HttpAgent`, `AssistantRuntimeProvider`, `ThreadPrimitive`, `ComposerPrimitive`, `MessagePrimitive`, `useAgUiRuntime` | 1 034,84 kB | 283,94 kB |

Рост около +842 kB (+225 kB gzip). Сама установка пакетов размер не меняет (без импортов дерево сборки их отбрасывает), поэтому замер сделан временным импортом, который затем убран. Для расширения, грузящегося локально, это приемлемо, но риск «рост бандла» из design.md остаётся: при реализации импортировать только нужные примитивы и пересмотреть размер после задач клиента (повторный замер в 15.x).

## 1.4 Прототип HttpAgent и SSE

Заглушка: `manager-helper/scripts/sse-stub-server.mjs` (`node scripts/sse-stub-server.mjs [port]`, по умолчанию 3999). Отдаёт на `POST /agent` SSE: `RUN_STARTED`, `TEXT_MESSAGE_START`, три `TEXT_MESSAGE_CONTENT`, `TEXT_MESSAGE_END`, `RUN_FINISHED`; отвечает на `OPTIONS` с CORS-заголовками. Клиент: `scripts/agent-spike.mjs` (`HttpAgent` из `@ag-ui/client`). Оба файла вне сборки расширения (`vite build` их не берёт).

Результат (Node, `HttpAgent.runAgent`): поток доходит, события разобраны в порядке `RUN_STARTED TEXT_MESSAGE_START TEXT_MESSAGE_CONTENT x3 TEXT_MESSAGE_END RUN_FINISHED`, сообщение ассистента собрано: «Привет, это ответ-заглушка.».

Заголовки запроса `HttpAgent` (проверено эхо-сервером): `Accept: text/event-stream`, `Content-Type: application/json`, метод `POST`. Заголовок `Accept` выставляется клиентом сам.

### Что нужно серверу по CORS

Проверено curl-ом на заглушке (с `Origin: chrome-extension://abc`):

- ответ на `POST /agent`: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Access-Control-Allow-Origin: *`, чанковая передача (`Transfer-Encoding: chunked`), без буферизации;
- preflight `OPTIONS /agent` (`Access-Control-Request-Method: POST`, `Access-Control-Request-Headers: content-type,accept`) отвечает `204` с `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS`, `Access-Control-Allow-Headers: Content-Type, Accept`.

Для backend (NestJS): `app.enableCors()` должен разрешать origin расширения (`chrome-extension://<id>`), методы `GET, POST, PATCH, DELETE, OPTIONS` (нужны `PATCH` и `DELETE` для `/threads`) и заголовки `Content-Type, Accept`. Предварительно считаем, что запросы из side panel с `host_permissions` на localhost обходят CORS-проверку; настройки сервера нужны как страховка и для запросов с других origin.

### Что не проверено и остаётся на задачу 15.1 (Chrome)

В реальном браузере проверить нельзя было, поэтому остаётся проверить в Chrome с собранным расширением:

- что `fetch` из side panel к `http://localhost:<port>/agent` проходит с `host_permissions` и без/с CORS-заголовками сервера (реальный preflight из `chrome-extension://`);
- что SSE не буферизуется и частичные `TEXT_MESSAGE_CONTENT` приходят по мере генерации (curl-ом подтверждена только отдача чанками);
- что `useAgUiRuntime` из `@assistant-ui/react-ag-ui` 0.1.1 работает с `HttpAgent` в side panel, а `onCancel` можно связать с `run/cancel`;
- поведение при закрытии side panel посреди потока (запрос обрывается, сервер запуск не отменяет).
