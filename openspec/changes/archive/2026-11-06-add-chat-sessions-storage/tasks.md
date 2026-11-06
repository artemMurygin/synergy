## 0. Setup

- [x] 0.1 Установить в `backend` пакет `@langchain/langgraph-checkpoint-postgres` (версия, совместимая с установленным `@langchain/langgraph`) и проверить: `npm ls @langchain/langgraph @langchain/langgraph-checkpoint-postgres` без конфликтов, `npm run typecheck` проходит
- [x] 0.2 Добавить в `manager-helper` dev-зависимости для тестов (`vitest`, `jsdom`, `@testing-library/react`), скрипт `test` в `package.json` и убедиться, что `npm test` запускается (пустой прогон без ошибок конфигурации)

## 1. Backend: миграция БД (`012_chat_sessions.sql`)

- [x] 1.1 Написать тест миграции (по образцу `programs-etl-migrations.spec.ts`): после `migrate()` существуют таблицы `chat_session` и `chat_message`, каскадное удаление сообщений при удалении сессии, индексы по `last_activity_at` и `(session_id, id)`; убедиться, что раннер видит тест
- [x] 1.2 Прогнать тест из 1.1 и зафиксировать, что он падает (red): таблиц ещё нет
- [x] 1.3 Добавить `backend/db/migrations/012_chat_sessions.sql`: `chat_session(id uuid pk, title, title_is_custom, created_at, last_activity_at)`, `chat_message(id bigserial pk, session_id fk on delete cascade, role, text, tool_calls jsonb, duration_ms, created_at)`, индексы (design, решение 1)
- [x] 1.4 Прогнать тест из 1.1 (green) и весь набор `npm test` в `backend`, регрессий в соседних миграционных тестах нет

## 2. Backend: домен (`ChatSession`, `ChatMessage`, `ChatTitle`, `ChatRole`)

- [x] 2.1 Написать unit-тесты домена по specs `chat-sessions`: `ChatTitle` (trim, 1–120 символов, пробелы отклоняются, `default()` = «Новый чат», `fromQuestion` усекает до ~60 символов), `ChatSession` (явное название выставляет `titleIsCustom` и не перезаписывается автоназванием; автоназвание только для названия по умолчанию), `ChatMessage` (роль `user|agent`, `toolCalls`/`durationMs` только у агента)
- [x] 2.2 Прогнать тесты из 2.1 и зафиксировать, что они падают (red): классов нет
- [x] 2.3 Реализовать сущности и value objects в `sheets-qa/domain` и доменную ошибку `ChatSessionNotFoundError`
- [x] 2.4 Прогнать тесты из 2.1 (green) и `npm test` целиком, регрессий нет

## 3. Backend: репозиторий сессий (`ChatSessionRepositoryPort` + `PostgresChatSessionRepository`)

- [x] 3.1 Написать тесты репозитория на реальном Postgres (по образцу `postgres-source-state-repository.spec.ts`): `create/findById/list` (сортировка по `lastActivityAt desc`), `listMessages` (хронологический порядок), `appendUserMessage`, `appendAgentAnswer` (в одной транзакции: ответ + `lastActivityAt` + автоназвание, откат при ошибке), `rename` (не трогает `lastActivityAt`), `delete` (каскад сообщений)
- [x] 3.2 Прогнать тесты из 3.1 и зафиксировать, что они падают (red): порта и реализации нет
- [x] 3.3 Реализовать порт в `domain/ports` и `PostgresChatSessionRepository` в `infrastructure` на slonik (`PG_POOL`)
- [x] 3.4 Прогнать тесты из 3.1 (green) и `npm test` целиком, регрессий нет

## 4. Backend: use-case'ы управления сессиями

- [x] 4.1 Написать тесты на `CreateChatSessionUseCase`, `ListChatSessionsUseCase`, `GetChatMessagesUseCase` (404 для неизвестной сессии), `RenameChatSessionUseCase` (404, валидация названия), `DeleteChatSessionUseCase` (удаляет сессию и вызывает `ChatThreadPort.deleteThread`; 404 при повторном удалении) — с in-memory фейками портов
- [x] 4.2 Прогнать тесты из 4.1 и зафиксировать, что они падают (red)
- [x] 4.3 Реализовать use-case'ы в `sheets-qa/application` и порт `ChatThreadPort`
- [x] 4.4 Прогнать тесты из 4.1 (green) и `npm test` целиком, регрессий нет

## 5. Backend: вопрос агенту в рамках сессии (`AskQuestionUseCase`, **BREAKING**)

- [x] 5.1 Расширить `ask-question.use-case.spec.ts` по specs: неизвестная сессия → 404 без вызова агента и записи; порядок «проверка → запись вопроса → агент → запись ответа»; при ошибке/таймауте агента вопрос остаётся, ответ не пишется; автоназвание по первому вопросу; явное название не перезаписывается; валидация пустого и длинного вопроса сохраняется
- [x] 5.2 Прогнать тесты из 5.1 и зафиксировать, что новые падают (red), старые валидационные проходят
- [x] 5.3 Изменить `AskQuestionUseCase` (зависимость от `ChatSessionRepositoryPort`), `SheetsQaController` (маппинг `ChatSessionNotFoundError` → 404)
- [x] 5.4 Прогнать тесты из 5.1 (green) и `npm test` целиком, регрессий нет

## 6. Backend: постоянный контекст агента (`PostgresSaver`)

- [x] 6.1 Написать тесты по specs «Сохранность данных после перезапуска» и «Изоляция контекста»: два экземпляра `DeepAgentsSheetsAssistant` с общей БД — второй продолжает диалог первого (thread_id = sessionId); контексты разных сессий не пересекаются; `PostgresChatThread.deleteThread` удаляет контекст (на фейковой модели, без реальных LLM-вызовов)
- [x] 6.2 Прогнать тесты из 6.1 и зафиксировать, что они падают (red): используется `MemorySaver`
- [x] 6.3 Заменить `MemorySaver` на `PostgresSaver` (общий `POSTGRES_URL`), вызвать `setup()` при старте рядом с `migrate()`, реализовать `PostgresChatThread`, описать в README, что таблицы checkpointer'а создаёт библиотека (design: риски)
- [x] 6.4 Прогнать тесты из 6.1 (green) и `npm test` целиком, регрессий нет

## 7. Backend: HTTP API сессий (`ChatSessionsController`)

- [x] 7.1 Написать e2e/controller-тесты по REST-контракту architecture.md: `POST/GET /chat-sessions`, `GET /chat-sessions/:id/messages`, `PATCH /chat-sessions/:id`, `DELETE /chat-sessions/:id` (204), коды 400 (валидация zod) и 404, `POST /sheets-qa/ask` → 404 для неизвестной сессии
- [x] 7.2 Прогнать тесты из 7.1 и зафиксировать, что они падают (red): контроллера нет
- [x] 7.3 Реализовать `ChatSessionsController`, зарегистрировать провайдеры и контроллер в `SheetsQaModule`, добавить Swagger-теги
- [x] 7.4 Прогнать тесты из 7.1 (green), `npm run typecheck`, `npm run lint` и `npm test` целиком — без ошибок

## 8. Frontend: API-слой и активный чат (`manager-helper/src/shared`)

- [x] 8.1 Написать тесты (`vitest`, `fetch` замокан) на `chat-sessions-api` (`listSessions/createSession/getMessages/renameSession/deleteSession`, разбор ответов, `AskError` для 404 и сетевых ошибок), обновлённый `askAgent` (404 сессии) и `active-session` (get/set в `chrome.storage.local`, безопасно при недоступности)
- [x] 8.2 Прогнать тесты из 8.1 и зафиксировать, что они падают (red)
- [x] 8.3 Реализовать `shared/chat-sessions-api.ts`, `shared/active-session.ts`, обновить `shared/api.ts`
- [x] 8.4 Прогнать тесты из 8.1 (green), `npm run typecheck` и `npm run lint` в `manager-helper` без ошибок

## 9. Frontend: хуки состояния

- [x] 9.1 Написать тесты хуков по specs `chat-session-switcher`: `useChatSessions` (загрузка/ошибка/повтор, создание → активный, выбор, переименование, удаление активного → переход на самый свежий или пустое состояние, восстановление активного чата при открытии), `useChat(sessionId)` (загрузка истории, блокировка отправки во время ответа, ошибка не стирает историю, ответ после переключения остаётся в чате-отправителе — свой `AbortController`/`sessionId` на запрос, состояние формы и черновик не переносятся между чатами)
- [x] 9.2 Прогнать тесты из 9.1 и зафиксировать, что они падают (red)
- [x] 9.3 Реализовать `sidepanel/use-chat-sessions.ts`, переработать `sidepanel/use-chat.ts` (принимает `sessionId`, история с сервера)
- [x] 9.4 Прогнать тесты из 9.1 (green) и `npm run typecheck`/`npm run lint`, регрессий нет

## 10. Frontend: экраны (по `ui-design.md`, .pen: `design/synergy-design-kit.pen`)

Перед каждой задачей прочитать фрейм через `mcp__pencil__execute` / `Get` и сверить итог со скриншотом.

- [x] 10.1 Реализовать `ChatHeader` и режим «Чат» по фреймам `s7f4n` (активный), `y4MBK5` (агент отвечает), `L0EhQB` (пустой новый чат); кнопка «Очистить» заменена на «Новый чат». Тест на логику (disabled-состояния, показ индикатора ожидания); чистая вёрстка отдельно не тестируется, т.к. не содержит ветвлений
- [x] 10.2 Реализовать `ChatSessionList` и `ChatSessionItem` по фрейму `k2xZXW` и состояниям: переименование и подтверждение удаления `u7dlI3`, пусто `L73oh`, ошибка + «Повторить» `pxVLF`, загрузка (skeleton) `MIqen`. Тесты на ветвления состояний, подтверждение и отмену удаления, inline-переименование
- [x] 10.3 Адаптировать `QuickSearchForm` и `NextSteps` по `s7f4n` / `L0EhQB` (референс текущего вида — `fxiju`): форма раскрыта в чате без ответов и свёрнута в чате с ответами, закреплённая кнопка «Начать подбор», сброс состояния при смене чата (`key=sessionId`), название нового чата по параметрам формы (`onSubmit` отдаёт краткое название, клиент вызывает переименование). Тесты на правила раскрытия и формирование названия
- [x] 10.4 Реализовать адаптив по ширине панели (порог 640 px): узкая — один режим с переходом между «Чат» и «Список», широкая — две колонки по фреймам `D13EfJ` и `Z06fX`; при смене ширины сохраняются активный чат и черновик. Тест на переключение режима по ширине
- [x] 10.5 Собрать `sidepanel/App.tsx` из новых компонентов и хуков; `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` в `manager-helper` без ошибок

## 11. Интеграционная проверка

- [ ] 11.1 Запустить бэкенд с Postgres и собранное расширение, пройти сценарий вручную (скилл `run`): создать два чата → задать вопросы → переключиться и убедиться в изоляции контекста → перезапустить бэкенд → открыть панель, история и контекст сохранены → переименовать и удалить чат; результат (скриншоты/лог) приложить к отчёту — серверная часть пройдена (CRUD, перезапуск, изоляция, каскад, контекст после рестарта); проверка панели в Chrome осталась пользователю
- [ ] 11.2 Проверить узкую и растянутую панель (порог 640 px) и сверить экраны с макетами `KBBna` — осталось пользователю

## 12. Code review

- [x] 12.1 Запустить code-review (скилл `code-review`) по всем изменениям фичи - от коммита, с которого начат change, до текущего HEAD: соответствие стандартам проекта и specs этого change
- [x] 12.2 Исправить замечания ревью (блокирующие и существенные обязательно; остальные - исправить или явно отклонить с обоснованием), результат зафиксировать коммитом (исправлены 4 major-замечания; коммит не делался — по запросу пользователя)
- [x] 12.3 Повторить code-review по правкам из 12.2 и убедиться, что блокирующих замечаний нет; прогнать тесты и зафиксировать, что они зелёные
