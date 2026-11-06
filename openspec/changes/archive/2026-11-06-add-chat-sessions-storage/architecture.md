# Architecture: add-chat-sessions-storage

## Scope
Backend: модуль `sheets-qa` (новая подсистема сессий чата, замена `MemorySaver` на `PostgresSaver`, миграция `012`). Frontend: side panel расширения `manager-helper` (список чатов, переключение, хуки состояния). Основание — `proposal.md`, `design.md`, `specs/`.

---

## Backend — Domain Model

### Entities
| Name | Status | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `ChatSession` | new | да | `id (uuid)`, `title`, `titleIsCustom`, `createdAt`, `lastActivityAt` | Чат по одной теме |
| `ChatMessage` | new | нет | `id`, `sessionId`, `role (user/agent)`, `text`, `toolCalls`, `durationMs`, `createdAt` | Сообщение в истории чата |

### Aggregates
| Aggregate | Root entity | Входит в состав | Инварианты |
|---|---|---|---|
| `ChatSession` | `ChatSession` | `ChatMessage[]` (доступ через репозиторий, без загрузки всей истории в агрегат) | Название 1–120 символов после trim; сообщения хронологичны; сообщения существуют только внутри сессии; явное название не перезаписывается автоназванием |

### Value Objects
| Name | Поля | Почему VO |
|---|---|---|
| `ChatTitle` | `value: string` | Самовалидируется (trim, 1–120), иммутабелен; фабрики `default()` и `fromQuestion(text)` (усечение ~60 символов) |
| `ChatRole` | `'user' \| 'agent'` | Закрытое множество значений |
| `ToolCallTrace` | `name`, `args` | Существует (`collectToolCalls`), переиспользуется как снимок |

### Services
| Service | Слой | Ответственность |
|---|---|---|
| `CreateChatSessionUseCase` | application | Создать сессию |
| `ListChatSessionsUseCase` | application | Список по `lastActivityAt desc` |
| `GetChatMessagesUseCase` | application | История сессии (404, если нет) |
| `RenameChatSessionUseCase` | application | Переименование, `titleIsCustom=true` |
| `DeleteChatSessionUseCase` | application | Удаление сессии, сообщений и thread в checkpointer'е |
| `AskQuestionUseCase` | application | **existing, меняется**: проверка сессии → запись вопроса → агент → запись ответа + активность + автоназвание |
| `ChatSessionRepositoryPort` | domain/ports | Хранение сессий и сообщений |
| `ChatThreadPort` | domain/ports | Удаление контекста агента по `sessionId` |
| `PostgresChatSessionRepository` | infrastructure | Реализация порта на slonik (`PG_POOL`) |
| `PostgresChatThread` | infrastructure | Реализация порта через `PostgresSaver.deleteThread` |
| `DeepAgentsSheetsAssistant` | infrastructure | **existing, меняется**: `MemorySaver` → `PostgresSaver` |
| `ChatSessionsController` | interface/http | REST эндпоинты сессий, валидация zod |
| `SheetsQaController` | interface/http | **existing, меняется**: 404 для неизвестной сессии |

### Method Signatures (ключевые)
| Service.Method | Params | Returns | Описание |
|---|---|---|---|
| `CreateChatSessionUseCase.execute` | `title?: string` | `ChatSession` | Создать сессию |
| `ListChatSessionsUseCase.execute` | — | `ChatSession[]` | Список |
| `GetChatMessagesUseCase.execute` | `sessionId` | `ChatMessage[]` | История или `ChatSessionNotFoundError` |
| `RenameChatSessionUseCase.execute` | `sessionId, title` | `ChatSession` | Переименовать |
| `DeleteChatSessionUseCase.execute` | `sessionId` | `void` | Удалить сессию и thread |
| `AskQuestionUseCase.execute` | `question, sessionId` | `AssistantAnswer` | Вопрос в рамках сессии |
| `ChatSessionRepositoryPort.create / findById / list / rename / delete` | — | — | CRUD сессий |
| `ChatSessionRepositoryPort.appendUserMessage` | `sessionId, text` | `ChatMessage` | Запись вопроса |
| `ChatSessionRepositoryPort.appendAgentAnswer` | `sessionId, answer, autoTitle?` | `ChatMessage` | Транзакция: ответ + `lastActivityAt` + автоназвание |
| `ChatSessionRepositoryPort.listMessages` | `sessionId` | `ChatMessage[]` | История |

Решение по размещению: подсистема остаётся **внутри модуля `sheets-qa`** (единственный потребитель; см. `design.md`, решение 4).

### REST API
| Метод | Путь | Тело / ответ |
|---|---|---|
| POST | `/chat-sessions` | `{title?}` → `ChatSession` |
| GET | `/chat-sessions` | → `ChatSession[]` |
| GET | `/chat-sessions/:id/messages` | → `ChatMessage[]` |
| PATCH | `/chat-sessions/:id` | `{title}` → `ChatSession` |
| DELETE | `/chat-sessions/:id` | → 204 |
| POST | `/sheets-qa/ask` | `{question, sessionId}` → `{answer, toolCalls, durationMs}`; 404 для неизвестной сессии |

---

## Frontend — UI Model

> `manager-helper` — расширение Chrome (React + Vite), не FSD-приложение; `frontend/CLAUDE.md` к нему не относится. Сохраняем существующую структуру `src/sidepanel` + `src/shared`, не вводим новых слоёв.

### Pages
| Page | Route | Структура | Назначение |
|---|---|---|---|
| Side panel (`sidepanel/App.tsx`) | — | existing, меняется | Корневой экран: переключение режимов «чат» / «список чатов» |

### Features
Отдельных features нет — модули остаются в `sidepanel/`.

### UI-компоненты
| Component | Расположение | Props (основные) | Назначение | Status |
|---|---|---|---|---|
| `ChatSessionList` | `sidepanel/ChatSessionList.tsx` | `sessions, activeId, onSelect, onCreate, onRename, onDelete, status, onRetry` | Список чатов, пустое состояние, ошибка | new |
| `ChatSessionItem` | `sidepanel/ChatSessionItem.tsx` | `session, active, onSelect, onRename, onDelete` | Строка списка, inline-переименование, подтверждение удаления | new |
| `ChatHeader` | `sidepanel/ChatHeader.tsx` | `title, onOpenList, onNewChat` | Шапка: название, вход в список, «Новый чат» | new |
| `App` | `sidepanel/App.tsx` | — | Композиция; кнопка «очистить» заменяется на «Новый чат» | existing |
| `Message` | `sidepanel/Message.tsx` | — | Без изменений | existing |
| `QuickSearchForm` | `sidepanel/QuickSearchForm.tsx` | `open, onToggle, pending, onSubmit` | existing, меняется: состояние формы живёт на уровне активного чата (ремонтируется по `key=sessionId`), `onSubmit` дополнительно отдаёт краткое название по параметрам | existing |
| `NextSteps` | `sidepanel/NextSteps.tsx` | `lastAnswer, onSend, onNewSearch` | Без изменений; показывается только в чате с ответом | existing |

### Hooks (model)
| Hook / модуль | Расположение | Тип | Возвращает |
|---|---|---|---|
| `useChatSessions` | `sidepanel/use-chat-sessions.ts` | state-хук | `sessions, status, activeId, select, create, rename, remove, reload` |
| `useChat(sessionId)` | `sidepanel/use-chat.ts` | state-хук, **existing, меняется** | `messages, pending, historyStatus, send` (история грузится с сервера; запрос привязан к своему `sessionId`) |
| `chat-sessions-api` | `shared/chat-sessions-api.ts` | API-функции | `listSessions, createSession, getMessages, renameSession, deleteSession` |
| `askAgent` | `shared/api.ts` | existing, меняется | Обработка 404 сессии |
| `active-session` | `shared/active-session.ts` | storage-хелпер | `getActiveSessionId / setActiveSessionId` (`chrome.storage.local`) |

### Паттерны
- [x] Ошибки API нормализуются в один тип ошибки (расширение существующего `AskError`)
- [x] Разделение `isInitialLoad` / `isRefreshing`: список не «схлопывается» при перезагрузке
- [x] Единственный источник правды — сервер; в `chrome.storage` только id активного чата
- [ ] Остальные паттерны FSD неприменимы

---

## Диаграммы взаимодействия
Диаграммы создаются на Miro-доске, в файл вставляются ссылки. **Статус: ожидают решения пользователя о создании доски в Miro.**

1. Backend: компоненты и зависимости (controller → use-case → ports → Postgres / PostgresSaver) — _ссылка: TBD_
2. Sequence: «вопрос в чат» (UI → ask → репозиторий → агент → checkpointer → запись ответа) — _ссылка: TBD_
3. Frontend: компоненты и поток данных (App → хуки → API → backend; `chrome.storage`) — _ссылка: TBD_

---

## Confirmation Checklist
- [x] Сущности и агрегат `ChatSession` согласованы
- [x] Подсистема внутри `sheets-qa`, без отдельного модуля
- [x] REST-контракт согласован
- [x] Структура frontend-компонентов и хуков согласована
- [ ] Диаграммы созданы и проверены
