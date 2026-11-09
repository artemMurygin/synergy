<!--
  Artifact: architecture
  Требует согласования с пользователем перед созданием tasks.md.
  Примечание: шаблон ссылается на FSD из frontend/CLAUDE.md, но такого файла в репозитории нет,
  а control-center использует плоскую структуру `features/ components/ stores/ lib/`.
  Поэтому раздел Frontend описан в терминах существующей структуры control-center, без слоёв FSD.
-->

# Architecture: add-electron-chat-interface

## Scope

Клиентская часть: приложение `control-center` (Electron: main + preload + renderer). Backend `sheets-qa` **не меняется** — используются существующие `/threads` и `/agent`. Новая «серверная» логика ограничена main-процессом Electron (прокси `cc-api://`, см. `design.md`, решение 1).

---

## Backend — Domain Model

Backend-изменений нет. Доменные сущности принадлежат модулю `sheets-qa` и описаны в спеках `chat-sessions` и `agent-streaming-protocol`. Ниже — только то, что клиент от них использует (контракт), и новые сервисы main-процесса.

### Entities
| Name | Status | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| Thread (чат) | existing | да | `id`, `title`, `titleIsCustom`, `createdAt`, `lastActivityAt`, `running` | Чат; идентификатор совпадает с `threadId` в AG-UI |
| Message | existing | нет (часть Thread) | `id`, `role`, `content` (формат AG-UI) | Сообщение истории чата |
| Run (запуск агента) | existing | нет | `threadId`, `runId`, поток событий AG-UI | Один ответ агента; в чате одновременно не более одного |

### Aggregates
| Aggregate | Root entity | Входит в состав | Инварианты (на стороне backend) |
|---|---|---|---|
| Thread | Thread | Message, Run | Название ≤ 120 символов и не пустое; один активный Run на Thread (иначе 409); удаление Thread отменяет Run и стирает историю |

### Value Objects
Новых нет. На клиенте контракт выражается zod-схемами (`ThreadSchema`, `ThreadHistorySchema`); схемы описаны в разделе Frontend.

### Services (main-процесс Electron)
| Service | Слой | Ответственность |
|---|---|---|
| `BackendConfig` | main / config | Читает `CC_BACKEND_URL` (по умолчанию `http://localhost:3000`), валидирует, отдаёт базовый адрес |
| `CcApiProtocol` | main / transport | Регистрирует схему `cc-api` и проксирует запросы renderer в backend через `net.fetch`, сохраняя стриминг SSE; точка вставки `Authorization` во втором заходе |

### Method Signatures
| Service.Method | Params | Returns | Описание |
|---|---|---|---|
| `BackendConfig.getBackendUrl` | — | `string` | Базовый URL backend без завершающего `/` |
| `CcApiProtocol.registerScheme` | — | `void` | `protocol.registerSchemesAsPrivileged` (до `app.whenReady`) |
| `CcApiProtocol.install` | `backendUrl: string` | `void` | `protocol.handle('cc-api', …)` после `app.whenReady` |
| `CcApiProtocol.forward` | `request: Request`, `backendUrl: string` | `Promise<Response>` | Переписывает URL `cc-api://backend/<path>` на `<backendUrl>/<path>`, пересылает метод, заголовки и тело (`duplex: 'half'`); при сетевой ошибке возвращает `502` с JSON-описанием |

---

## Frontend — UI Model

Структура `control-center/src/renderer/src` (существующая: `features/`, `components/ui/`, `stores/`, `lib/`). Правила импортов для этого change:
- `features/chat` и `features/chat-list` **не импортируют друг друга**; связь только через общий `stores/chat.store.ts` и композицию в `layouts/ChatLayout.tsx`.
- `lib/backend` ничего не знает про React-компоненты.
- Публичный API фичи — только `index.ts`.
- Новые общие UI-примитивы — в `components/ui/` (shadcn-стиль, как `button.tsx`, `table.tsx`).

### Pages / Layouts
| Страница | Route | Структура | Назначение |
|---|---|---|---|
| `ChatLayout` (в `layouts/`) | — (роутера нет, единственный экран) | компонент с именованными слотами `sidebar` и `main` | Двухколоночная раскладка; `App.tsx` собирает `<ChatLayout sidebar={<ChatList/>} main={<ChatThread/>} />` |

### Features
| Feature | Статус | Публичный API (`index.ts`) | Внутри | Назначение |
|---|---|---|---|---|
| `chat-list` | new | `ChatList` | `api.ts` (query/mutations), `ChatList.tsx`, `ChatListItem.tsx` (режимы normal / rename / confirmDelete), `RenameThreadInput.tsx`, `ChatListSkeleton.tsx` | Список, создание, переименование, удаление чатов |
| `chat` | new | `ChatThread` | `ChatRuntimeProvider.tsx`, `ChatThread.tsx`, `Composer.tsx`, `UserMessage.tsx`, `AssistantMessage.tsx`, `use-thread-history.ts`, `use-cancel-run.ts` | Диалог с агентом: история, стрим, остановка |
| `items` | existing | — | демо-таблица | Остаётся до замены; из `App.tsx` убирается |

### Shared-модули
| Модуль | Расположение | Назначение |
|---|---|---|
| Клиент backend | `lib/backend/client.ts` | `request(path, init)` на `cc-api://backend`; нормализация сетевых ошибок и статусов в `BackendError` |
| Ошибки | `lib/backend/errors.ts` | `BackendError`, `ThreadNotFoundError` (404), `RunConflictError` (409) |
| Контракт | `lib/backend/schema.ts` | zod: `ThreadSchema`, `ThreadHistorySchema` |
| API чатов | `lib/backend/threads.api.ts` | `listThreads`, `createThread`, `getThreadHistory`, `renameThread`, `deleteThread`, `cancelRun` |
| Фабрика агента | `lib/backend/agent.ts` | `createAgent(threadId)` → `HttpAgent({ url: 'cc-api://backend/agent', threadId })` |
| Хранилище | `stores/chat.store.ts` | zustand: `activeThreadId`, `setActiveThread`; сохранение в `localStorage` |

### UI-компоненты
| Component | Расположение | Props (основные) | Назначение |
|---|---|---|---|
| `ChatList` | `features/chat-list` | — | Заголовок, кнопка «Новый чат», список, состояния загрузки/пусто/ошибка |
| `ChatListItem` | `features/chat-list` | `thread`, `active`, `onSelect`, `onRename`, `onDelete` | Строка: название, время, действия; режимы normal / rename / confirmDelete (подтверждение встроено в строку, предупреждение, если `running`) |
| `RenameThreadInput` | `features/chat-list` | `initialTitle`, `onSubmit`, `onCancel` | Инлайн-редактор названия (Enter / Esc, ≤ 120) |
| `ChatThread` | `features/chat` | — (читает `activeThreadId`) | Пустое состояние / история / поле ввода |
| `ChatRuntimeProvider` | `features/chat` | `threadId`, `initialMessages`, `children` | Подключает `HttpAgent` к `assistant-ui` runtime |
| `Composer` | `features/chat` | — | Ввод, отправка, кнопка «Остановить»; черновик не теряется при ошибке |
| `UserMessage` / `AssistantMessage` | `features/chat` | сообщение из runtime | Отображение сообщений, индикатор «агент работает» |
| `ChatLayout` | `layouts` | `sidebar`, `main` (слоты) | Раскладка |
| `Input`, `Skeleton` | `components/ui` | стандартные | Новые примитивы (shadcn); `Dialog` не нужен |

### Hooks
| Hook | Расположение | Тип | Возвращает |
|---|---|---|---|
| `threadsQuery` | `features/chat-list/api.ts` | query options factory (`queryOptions`, ключ `['threads']`) | запрос списка чатов |
| `useCreateThread` | `features/chat-list/api.ts` | mutation | создаёт чат, делает его активным, инвалидирует `['threads']` |
| `useRenameThread` | `features/chat-list/api.ts` | mutation | переименовывает, инвалидирует `['threads']` |
| `useDeleteThread` | `features/chat-list/api.ts` | mutation | удаляет; если чат активный — переключает на соседний или сбрасывает |
| `useThreadHistory(threadId)` | `features/chat/use-thread-history.ts` | query | история `{ messages, running }`, `isInitialLoad`, ошибка |
| `useCancelRun(threadId)` | `features/chat/use-cancel-run.ts` | mutation | идемпотентная отмена (204 и 404 — не ошибки) |
| `useChatStore` | `stores/chat.store.ts` | zustand store | `activeThreadId`, `setActiveThread` |

### Паттерны
- [x] Публичный API фичи только через `index.ts`
- [x] Запросы — через `queryOptions` factory в `api.ts`, а не голые async-функции в компонентах
- [x] Ошибки API нормализуются в `BackendError` внутри `lib/backend`
- [x] Layout принимает именованные слоты, а не `children`
- [x] Разделение `isInitialLoad` / `isRefreshing`: список не «схлопывается» при фоновом обновлении
- [ ] Mediator-компонент — не нужен: два независимых виджета, связаны через store
- [ ] FSD-слои и `shared/ui-kit` — неприменимо (в репозитории нет `frontend/CLAUDE.md`)

---

## Diagrams

Доска Miro: https://miro.com/app/board/uXjVERcEVTg=/

### 1. Domain Entity Interaction
Thread (корень агрегата) 1 — * Message; Thread 1 — 0..1 Run; на клиенте: `ChatStore.activeThreadId` → Thread.id; `ThreadSchema` валидирует ответ `/threads`.
Miro link: https://miro.com/app/board/uXjVERcEVTg=/?moveToWidget=3458764689645844594

### 2. External Modules Interaction
Renderer (React, `cc-api://`) → Main (`CcApiProtocol`, `BackendConfig`) → Backend `sheets-qa` (`/threads` JSON, `/agent` SSE). Направление вызовов: renderer → main → backend; ответ SSE идёт обратно потоком, без буферизации. Во втором заходе: main подставляет JWT.
Miro link: https://miro.com/app/board/uXjVERcEVTg=/?moveToWidget=3458764689645844593

### 3. Layer Interaction — от действия пользователя до ответа
Отправка вопроса: `Composer` → runtime `assistant-ui` → `HttpAgent` → `fetch cc-api://backend/agent` → `CcApiProtocol.forward` → `net.fetch` → `AgentController.run` → поток событий AG-UI → обратно тем же путём → обновление `AssistantMessage`. Ветки ошибок: сеть (502 → сообщение «сервер недоступен»), 404 (чат удалён → сброс активного), 409 (в чате уже идёт ответ → уведомление), 400 (валидация).
Miro link: https://miro.com/app/board/uXjVERcEVTg=/?moveToWidget=3458764689645844592

---

## Confirmation Checklist
- [x] Названия entity/aggregate/VO согласованы
- [x] Названия и сигнатуры ключевых методов сервисов согласованы
- [x] Структура фронта (features / lib/backend / stores / layouts) и паттерны согласованы
- [x] Диаграммы взаимодействия отражают ожидаемую реализацию
- [x] Пользователь подтвердил переход к tasks.md
