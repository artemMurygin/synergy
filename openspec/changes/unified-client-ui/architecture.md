# Architecture: unified-client-ui

## Scope
Только клиенты: новый пакет `ui-kit/` (`@synergy/ui-kit`), view-слой `control-center/src/renderer/src` и `manager-helper/src`, корневой `package.json` с workspaces, UI Kit в `design/`. В бэкенде только подписанные ссылки на вложения задач в модуле `tasks` (D18). CORS уже пускает `chrome-extension://*` (`AUTH_ALLOWED_ORIGINS`).

---

## Backend — Domain Model

Меняется только модуль `tasks` (D18). Новых сущностей и агрегатов нет: используются существующие `Task` и `TaskAttachment`.

### Entities
| Name | Status | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `Task` | existing | да | id, участники | Проверка доступа на чтение |
| `TaskAttachment` | existing | нет | id, taskId, storageKey, originalName, contentType, sizeBytes | Вложение, на которое выдаётся ссылка |

### Value Objects
| Name | Поля | Почему VO |
|---|---|---|
| `AttachmentDownloadLink` | url, expiresAt | Неизменяемый результат use case |

### Services
| Service | Слой | Ответственность |
|---|---|---|
| `AttachmentDownloadTokenPort` | domain (port), `backend/src/modules/tasks/domain/ports/attachment-download-token.port.ts` | Подписать и проверить токен вложения |
| `JwtAttachmentDownloadToken` | infrastructure, `backend/src/modules/tasks/infrastructure/jwt/attachment-download-token.service.ts` | JWT с `FILES_DOWNLOAD_TOKEN_SECRET`, `aud: 'task-attachment'` |
| `CreateAttachmentDownloadLinkUseCase` | application, `backend/src/modules/tasks/application/create-attachment-download-link.use-case.ts` | Доступ к задаче → ссылка |
| `DownloadAttachmentByTokenUseCase` | application, `backend/src/modules/tasks/application/download-attachment-by-token.use-case.ts` | Проверка токена → поток файла |
| `TaskAttachmentsController` | interface, `backend/src/modules/tasks/interface/http/task-attachments.controller.ts` (existing) | Новые маршруты `download-link` и `content` |

### Method Signatures
| Service.Method | Params | Returns | Описание |
|---|---|---|---|
| `AttachmentDownloadTokenPort.sign` | attachmentId, ttlSec | `{ token, expiresAt }` | Подпись |
| `AttachmentDownloadTokenPort.verify` | token, attachmentId | boolean | false для просроченного, чужого или подделанного токена |
| `CreateAttachmentDownloadLinkUseCase.execute` | actor, taskId, attachmentId | `AttachmentDownloadLink` | 404 для задачи или вложения, отказ доступа как у скачивания, 503 без секрета |
| `DownloadAttachmentByTokenUseCase.execute` | taskId, attachmentId, token | `{ meta, stream }` | 403 при неверном токене, 404 если вложения нет |

---

## Frontend — UI Model

Структура: пакет `ui-kit/src/<область>/` содержит презентационные компоненты (props = данные + callbacks) и чистые функции. Приложения держат контейнеры: данные, API, платформа. Публичный API пакета — только `ui-kit/src/index.ts`, `ui-kit/src/icons.ts` и `ui-kit/styles/index.css` через `exports`.

### Pages
Роутинга нет ни в одном приложении: разделы переключаются состоянием. «Страница» здесь — экран раздела в контейнере приложения.

| Page | Route | Структура | Назначение |
|---|---|---|---|
| ChatsScreen (CC) | `ui.store.section = 'chats'` | `control-center/src/renderer/src/layouts/ChatLayout.tsx` → `ChatList` + `Thread` из пакета | Список чатов и чат, десктоп |
| TasksScreen (CC) | `section = 'tasks'` | `features/tasks/TasksPage.tsx` → компоненты задач из пакета | Список задач, фильтры, детали, создание |
| AppShell (CC) | — | `layouts/AppShell.tsx` → `AppFrame` + `NavRail` + `ProfileMenu` + уведомления из пакета | Оболочка CC (`LayoutModeProvider mode="desktop"`) |
| AuthGate (CC) | без сессии | `features/auth/AuthGate.tsx` → `LoginForm`, `ConnectionError`, `ChangePasswordDialog` из пакета | Вход, ошибка соединения, смена пароля |
| SidePanelApp (MH) | — | `manager-helper/src/sidepanel/App.tsx` → `AppFrame` (рейл или таб-бар по режиму) + `PanelHeader` + `ProfileMenu` | Оболочка панели, режим по ширине |
| ChatsScreen (MH) | `active-section = 'chats'` | `sidepanel/ChatPane.tsx` (переименование текущей связки `ThreadView` + `ChatSessionList`) → `ChatList` + `Thread` + `QuickSearchForm` (MH) | Чаты в панели |
| TasksScreen (MH) | `active-section = 'tasks'` | `sidepanel/tasks/TasksApp.tsx` → компоненты задач из пакета | Задачи в панели |
| TelegramScreen (MH) | из меню профиля | `sidepanel/telegram/TelegramPane.tsx` (new) → `TelegramConnectPanel` / `TelegramLinkedPanel` из пакета | Telegram внутри панели |
| OptionsPage (MH) | `options.html` | `options/App.tsx` → примитивы пакета + те же панели Telegram | URL бэкенда и портала, Telegram |
| AuthGate (MH) | без сессии | `shared/auth/ui/AuthGate.tsx` → компоненты авторизации из пакета | Вход, ошибка соединения, смена пароля |

### Features (модули пакета)
| Feature | Статус | Публичный API (`ui-kit/src/index.ts`) | Логика / model | Назначение |
|---|---|---|---|---|
| `ui-kit/styles` | new | `@synergy/ui-kit/styles.css` | `tokens.css`, `fonts.css`, `base.css` | Токены UI Kit, шрифты, `color-scheme: light`, `.markdown` |
| `ui-kit/src/layout` | new | `LayoutModeProvider`, `useLayoutMode`, `layoutModeForWidth`, `WIDE_BREAKPOINT`, `chatPaneVisibility`, `tasksPaneVisibility` | `layout-mode.ts`, `use-viewport-width.ts`, `pane-visibility.ts` | Режимы desktop / tablet / mobile |
| `ui-kit/src/primitives` | new | `Button`, `Input`, `PasswordField`, `Textarea`, `Switch`, `InlineConfirm`, `Dialog`, `Popover`, `Menu`, `Sheet`, `Badge`, `Skeleton`, `SegmentedControl` | cva-варианты | Базовые элементы по UI Kit |
| `ui-kit/src/icons.ts` | new | `@synergy/ui-kit/icons` | — | lucide с умолчаниями UI Kit |
| `ui-kit/src/shell` | new | `AppFrame`, `NavRail`, `TabBar`, `PanelHeader`, `ProfileButton`, `ProfileMenu` | выбор рейла или таб-бара по режиму | Оболочка |
| `ui-kit/src/notifications` | new | `NotificationsButton`, `NotificationsList`, `NotificationItem`, `NotificationToast`, `formatBadgeCount` | — | Уведомления внутри приложения |
| `ui-kit/src/chat` | new | `Thread`, `AssistantMessage`, `UserMessage`, `MarkdownText`, `ToolGroup`, `RunningIndicator`, `RunNotice`, `NextSteps`, `Composer`, `NewMessageButton` | `next-steps.ts` (`classifyAnswer`, наборы), `tool-status.ts` | Чат на примитивах assistant-ui |
| `ui-kit/src/chat/attachments` | new (перенос из CC) | `ComposerAttachments`, `MessageAttachments`, `FileCard`, `useComposerAttachments`, `withFileIds`, тип `FileUploadPort` | `use-composer-attachments.ts`, `message-files.ts`, `with-file-ids.ts` | Вложения в чате |
| `ui-kit/src/chat/chat-list` | new | `ChatList`, `ChatListItem`, `ChatListSkeleton`, `RenameThreadInput` | — | Список чатов, скрытие списка |
| `ui-kit/src/tasks` | new | `TaskList`, `TaskRow`, `TaskFilters`, `StatusBadge`, `DeadlineLabel`, `TaskDetails`, `TaskFormFields`, `UserPicker`, `AttachmentList`, `TaskNotFound` | `task-views.ts` (видимые сегменты по режиму), `deadline.ts` | Задачи |
| `ui-kit/src/telegram` | new | `TelegramConnectPanel`, `TelegramLinkedPanel`, `TelegramUnlinkConfirm`, `TelegramMenuItem` | — | Привязка Telegram |
| `ui-kit/src/auth` | new | `AuthBrand`, `LoginForm`, `ChangePasswordDialog`, `ConnectionError`, `RestoringScreen` | — | Авторизация, логотип «Синергия» |

### UI-компоненты (ключевые props)
| Component | Расположение | Props (основные) | Назначение |
|---|---|---|---|
| `AppFrame` | `ui-kit/src/shell/AppFrame.tsx` | `nav`, `header?`, `body`, `sections`, `activeSection`, `onSectionChange` | Подложка и панели; рейл или таб-бар по `LayoutMode` |
| `NavRail` / `TabBar` | `ui-kit/src/shell/` | `items: {id,label,icon,badge?}[]`, `active`, `onSelect`, `footer?` | Навигация «Чаты / Задачи» |
| `ProfileMenu` | `ui-kit/src/shell/ProfileMenu.tsx` | `user`, `telegram?: {label}`, `onTelegram`, `onChangePassword`, `onLogout` | Меню профиля |
| `NotificationsList` | `ui-kit/src/notifications/` | `items`, `state: 'loading'\|'empty'\|'error'\|'ready'`, `onOpen`, `onReadAll`, `onLoadMore`, `onRetry` | Список уведомлений |
| `Thread` | `ui-kit/src/chat/Thread.tsx` | `serverRunning`, `runError?`, `onRetry`, `onCancel`, `composer`, `empty?` | Лента внутри `AssistantRuntimeProvider` приложения |
| `ToolGroup` | `ui-kit/src/chat/ToolGroup.tsx` | `calls: ToolCallView[]` (из parts сообщения) | Группа вызовов, свёрнута по умолчанию |
| `NextSteps` | `ui-kit/src/chat/NextSteps.tsx` | `lastAnswer`, `disabled`, `onSend` | Подсказки над формой |
| `Composer` | `ui-kit/src/chat/Composer.tsx` | `attachments: ReturnType<useComposerAttachments>`, `disabled?` | Форма отправки |
| `ChatList` | `ui-kit/src/chat/chat-list/ChatList.tsx` | `threads`, `activeId`, `runningIds`, `state`, `onSelect`, `onCreate`, `onRename`, `onDelete`, `collapsed`, `onToggleCollapsed` | Список чатов |
| `TaskFilters` | `ui-kit/src/tasks/TaskFilters.tsx` | `view`, `onViewChange`, `status`, `onStatusChange`, `sort`, `onSortChange`, `overdueCount?`, `search`, `onSearch` | Сегменты + «Ещё» + статус + сортировка |
| `TaskDetails` | `ui-kit/src/tasks/TaskDetails.tsx` | `task`, `onPatch`, `onStatus`, `onUpload`, `onDeleteAttachment`, `onDownload`, `onDelete`, `onBack?` | Детали задачи |
| `LoginForm` | `ui-kit/src/auth/LoginForm.tsx` | `onSubmit`, `error?`, `pending` , `footer?` (MH: строка сервера) | Вход |
| `QuickSearchForm` | `manager-helper/src/sidepanel/QuickSearchForm.tsx` (existing) | без изменений API | Только MH, переводится на примитивы пакета |

### Hooks (model)
| Hook | Расположение | Тип | Возвращает |
|---|---|---|---|
| `useLayoutMode` | `ui-kit/src/layout/layout-mode.tsx` | state-хук (контекст) | `LayoutMode` |
| `useViewportWidth` | `ui-kit/src/layout/use-viewport-width.ts` | state-хук | ширина окна |
| `useComposerAttachments` | `ui-kit/src/chat/attachments/use-composer-attachments.ts` | state-хук с портом `FileUploadPort` | список вложений, `add`, `remove`, `retry`, `fileIds`, `isUploading` |
| `useChatListCollapsed` | `ui-kit/src/chat/chat-list/use-chat-list-collapsed.ts` | state-хук (sessionStorage) | `[collapsed, toggle]` |
| CC: `useFileUploadPort` | `control-center/src/renderer/src/features/chat/use-file-upload-port.ts` | адаптер | `FileUploadPort` поверх `lib/backend/xhr-upload` |
| MH: `useFileUploadPort` | `manager-helper/src/sidepanel/attachments/use-file-upload-port.ts` (new) | адаптер | `FileUploadPort` поверх XHR + токен `authFetch` |
| MH: `downloadFile` | `manager-helper/src/shared/files-api.ts` (new) | функция API | подписанная ссылка → `chrome.downloads.download({ url, filename })` |
| MH: `taskAttachmentLink` | `manager-helper/src/shared/tasks-api.ts` | функция API | `POST …/download-link` → `chrome.downloads.download` |
| MH: `useTaskAttachments` | `manager-helper/src/sidepanel/tasks/use-task-attachments.ts` (new) | state-хук | загрузка и удаление вложений задачи |

### Паттерны, которые нужно учесть
- [x] Публичный API пакета только через `exports` (`index.ts`, `icons.ts`, `styles.css`); глубокие импорты запрещены eslint.
- [x] Запросы к backend остаются в приложениях: CC — query options в `lib/backend/*.queries.ts`, MH — хуки и `*-api.ts`. Компоненты пакета запросов не делают.
- [x] Ошибки API нормализуются в приложениях (CC `lib/backend/errors.ts`, MH `shared/api.ts`); в пакет приходит готовый текст ошибки.
- [x] Контейнерные компоненты пакета (`AppFrame`, `Thread`) принимают именованные слоты (`nav`, `header`, `body`, `composer`), а не произвольные `children`.
- [x] `ChatList`, `NotificationsList`, `TaskList` различают первичную загрузку и обновление: при обновлении не схлопывают уже отрисованные данные.
- [x] Цвета, радиусы, тени, шрифты — только токенами UI Kit.

---

## Diagrams
Решение предыдущих change сохраняется: диаграммы даны текстом, доска Miro создаётся по просьбе пользователя. Miro link: не создавалась.

### 1. Domain Entity Interaction
Доменных изменений нет. Связи модулей пакета:
```
styles(tokens, fonts) ◄── primitives ◄── shell, notifications, chat, tasks, telegram, auth
icons ◄── все компоненты
layout(LayoutMode) ◄── shell(AppFrame: NavRail|TabBar), chat-list(скрытие), tasks(TaskFilters, pane-visibility)
chat/attachments(FileUploadPort, withFileIds) ◄── chat/Composer, chat/messages
```

### 2. External Modules Interaction
```
control-center renderer                         manager-helper sidepanel/options
  контейнеры (features/*, layouts/*)              контейнеры (sidepanel/*, options/*)
      │ props/callbacks                                │ props/callbacks
      ▼                                                ▼
            @synergy/ui-kit (только вид, assistant-ui примитивы)
      ▲                                                ▲
      │ данные                                         │ данные
  lib/backend (cc-api://) ── main-процесс ──►      shared/*-api (authFetch) ─────► backend REST / AG-UI / files
  socket в main (IPC) ──► уведомления              socket в service worker ──► port ──► уведомления
  shell.openExternal, save-blob                    chrome.tabs, chrome.downloads, chrome.notifications
```
Все вызовы бэкенда синхронные (HTTP / SSE AG-UI), уведомления — через WebSocket в платформенном процессе.

### 3. Layer Interaction — путь отправки сообщения с вложением
```
Composer (ui-kit) ── add(file) ──► useComposerAttachments ── port.upload(file,{onProgress,signal}) ──► адаптер приложения
   CC: xhr-upload → cc-api://backend/files → main → backend      MH: XHR + Bearer → {backendUrl}/files
   ◄── {fileId} ── плитка: прогресс → готово | ошибка (повторить/убрать)
Send ──► AssistantRuntime приложения ── withFileIds(agent)(fileIds) ──► HttpAgent → /agent (SSE)
   ◄── parts: text, tool-call ──► AssistantMessage → MarkdownText, ToolGroup (ui-kit)
   ◄── run finished ──► NextSteps(classifyAnswer(lastAnswer)) над формой
Ошибка запуска ──► RunNotice «Повторить» (onRetry контейнера)
```

---

## Confirmation Checklist
- [ ] Названия entity/aggregate/VO согласованы (бэкенд не меняется)
- [ ] Названия и сигнатуры ключевых методов согласованы (`FileUploadPort.upload`, `withFileIds`, `classifyAnswer`, `layoutModeForWidth`)
- [ ] Слои (пакет → контейнеры приложений), состав модулей пакета и паттерны согласованы
- [ ] Диаграммы взаимодействия (текстом) отражают ожидаемую реализацию
- [ ] Пользователь подтвердил переход к ui-design.md и tasks.md
