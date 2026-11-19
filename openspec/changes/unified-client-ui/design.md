## Context

Мотивация — в proposal.md, раздел Why. Требования — в `specs/`, главное — `specs/client-ui-kit/spec.md`. Визуальный эталон — доски «Единый дизайн · 01–06» и «Компоненты чата» в `design/synergy-design.pen`.

Текущее состояние, которое определяет подход:
- **Отдельные пакеты.** CC и MH — независимые npm-пакеты, у каждого свой `package-lock.json`. Корневого `package.json` нет, кросс-пакетного кода нет. Алиас `@/*` в CC указывает на `src/renderer/src`, в MH — на `src`.
- **Одинаковое ядро стека.** Общие версии: React ^19.3.1, Tailwind 4 через `@tailwindcss/vite`, Vite ^8.3.5, vitest ^5.1.0, zod 4. Чат одинаковый: `@assistant-ui/react` 0.15.32 + `@assistant-ui/react-ag-ui` 0.1.1 + `@ag-ui/client` 1.0.4. Расходится TypeScript: CC ^7.0.2, MH ~6.0.0. Линт (eslint 10 flat, `strictTypeChecked`, prettier) есть только в MH.
- **Чат построен одинаково.** В обоих приложениях runtime AG-UI (`useAgUiRuntime` + `HttpAgent`), история подставляется через `thread.import`, используются примитивы `ThreadPrimitive`, `MessagePrimitive`, `ComposerPrimitive`. Разное:
  - транспорт: в CC `cc-api://backend`, который проксирует main-процесс, в MH `authFetch` и URL из настроек;
  - вложения есть только в CC: `use-composer-attachments.ts`, XHR-загрузка, обёртка агента `withFileIds`;
  - группа инструментов (`ToolCallGroup`), `RunningIndicator` и `NextSteps` есть только в MH. Подсказки MH выбираются на клиенте: `classifyAnswer` в `shared/quick-search.ts` относит ответ к подборке, карточке или «прочему».
- **Оболочка разная.**
  - В CC — `layouts/NavRail.tsx` с переключателем темы, `AccountMenu`, уведомлениями; секция хранится в `ui.store`.
  - В MH — `SectionSwitch` и `PanelHeader` в шапке. Меню профиля нет, выход и Telegram — только на странице настроек.
- **Токены.**
  - MH: около 19 токенов прямо в `@theme` (`--color-brand-red`, `--color-ink-60`, `--color-line` …).
  - CC: модель shadcn — `:root` → `@theme inline`, `bg-primary`, `.dark`.
  - Hex-значения совпадают, имена разные. Оба файла ссылаются на удалённый `synergy-design-kit.pen`.
- **Примитивы.**
  - CC: shadcn в `components/ui/*` (button, dialog, input, popover, skeleton, switch, table, textarea); `lucide-react` импортируют 38 файлов.
  - MH: самописные `PrimaryButton`, `PasswordField`, `Switch`, `InlineConfirm` и около 35 SVG в `sidepanel/icons.tsx`.
- **Раскладка MH.** `panel-layout.ts` (`WIDE_BREAKPOINT = 640`, `paneVisibility`), `tasks/tasks-layout.ts`, `use-viewport-size.ts`.
- **Тесты.** В CC около 80 тестовых файлов в renderer, в MH около 69, везде vitest + jsdom + Testing Library. Тесты завязаны на роли и тексты, частично на классы.
- **Макеты.** Мастер-компоненты новых экранов лежат во фреймах «Компоненты» на досках 01–06, а не в UI Kit. Переменные UI Kit: `brand-red`, `ink-*`, `surface*`, `border*`, `r-*`, `font-ui`, `font-display` с префиксом библиотеки `t:`; `info-soft`, `success-soft`, `warning*` — без префикса.

## Goals / Non-Goals

**Goals:**
- **Один источник вида.** Токены, шрифты, иконки, примитивы, оболочка и view-компоненты фич живут в `@synergy/ui-kit`. Приложения дают данные и действия.
- **Без лишних шагов.** Правка пакета видна в dev-сервере обоих приложений без сборки пакета.
- **Один React и один assistant-ui.** Обе сборки и пакет используют один экземпляр, иначе ломаются хуки и контекст runtime.
- **Независимый переход.** Каждое приложение переходит на пакет отдельной волной; пакет не ломает приложение, которое его ещё не использует.

**Non-Goals:**
- **Общий слой API и схем.** `lib/backend/*` CC и `shared/*-api.ts` MH остаются в приложениях.
- **Роутинг и стейт-менеджмент.** CC остаётся на Zustand + TanStack Query, MH — на своих хуках. Пакет не тянет ни то, ни другое.
- **Публикация пакета, упаковка Electron и zip расширения.**
- **Редактирование сообщений и голосовой ввод.** Компоненты не содержат кнопок «Изменить» и микрофона.

## Decisions

### D1. npm workspaces в корне репозитория
Корневой `package.json` (`"private": true`, `"workspaces": ["ui-kit", "control-center", "manager-helper"]`) и один корневой `package-lock.json`. `react`, `react-dom` и `@assistant-ui/*` поднимаются в корневой `node_modules`, поэтому экземпляр у всех один. `backend/` и `portal/` в workspaces не входят. Команды приложений по-прежнему запускаются из их папок, установка — `npm install` в корне.

Рассмотренные альтернативы:
- **`file:../ui-kit`.** Зависимости пакета резолвятся из `ui-kit/node_modules`, получаются два React и два контекста assistant-ui, нужен `dedupe` в каждом конфиге.
- **pnpm или turbo.** Новый инструмент без выигрыша.

### D2. Пакет поставляется исходниками
`exports` в `ui-kit/package.json` указывают прямо на исходники: `.` → `src/index.ts`, `./icons` → `src/icons.ts`, `./styles.css` → `styles/index.css`. Код компилирует Vite приложения. Tailwind приложения сканирует пакет директивой `@source "<относительный путь>/ui-kit/src"` в CSS приложения. `react`, `react-dom`, `@assistant-ui/react` — `peerDependencies` пакета.

Альтернатива — сборка в `dist`. Она требует watch-процесса и даёт рассинхрон, а выигрыша нет: потребители — две Vite-сборки с одним TS.

### D3. Токены — имена переменных UI Kit, один словарь
Токены задаются в `ui-kit/styles/tokens.css` в `@theme`, чтобы Tailwind дал одноимённые классы. Имя переменной Pencil переносится без префикса `t:`:
- цвета — `--color-brand-red`, `--color-brand-red-soft`, `--color-ink`, `--color-ink-60`, `--color-surface`, `--color-surface-alt`, `--color-surface-sunken`, `--color-border`, `--color-info-soft`, `--color-success-soft`, `--color-warning` и т. д.;
- радиусы — `--radius-*` из `r-*`;
- тени — `--shadow-panel` (`0 2px 12px #0000000F`) и остальные тени из макетов;
- шрифты — `--font-ui` (Raleway), `--font-display` (Onest), `--font-chat` (Inter), `--font-mono` (JetBrains Mono).

Полный список выгружается из `design-kit.lib.pen` (`GetVariables`) в группе задач по пакету и сверяется тестом-снимком списка имён.

Второго словаря нет:
- семантика shadcn CC (`bg-primary`, `text-muted-foreground`, `border-border`) и имена MH (`--color-line`, `--font-heading`) переписываются на имена UI Kit;
- таблица «старое → новое» лежит в `ui-kit/CLAUDE.md`;
- в `base.css` задаются `color-scheme: light`, правило `body { font-family: var(--font-ui) }` вне слоёв (из MH) и стили `.markdown`.

Альтернатива — алиасы старых имён. Миграция была бы дешевле, но в коде навсегда остались бы два способа сказать одно и то же.

### D4. Примитивы: вид по UI Kit, каркас radix + cva
`ui-kit/src/primitives/*` — `Button` (`primary`, `secondary`, `ghost`, `icon-round`), `Input`, `PasswordField`, `Textarea`, `Switch`, `InlineConfirm`, `Dialog`, `Popover`, `Menu`, `Sheet`, `Badge`, `Skeleton`, `SegmentedControl`. Вид — по мастерам UI Kit. Каркас:
- **поведение** `Dialog` / `Popover` / `Menu` / `Sheet` / `Switch` — пакет `radix-ui`: он даёт фокус-ловушку, Escape и возврат фокуса;
- **варианты** — через `class-variance-authority`;
- **склейка классов** — `cn` на `clsx` + `tailwind-merge`.

`Table` из shadcn не переносится: на новых макетах задачи — список строк, а не таблица.

Альтернатива — перенести компоненты CC или MH как есть. Ни те, ни другие не совпадают с макетами, правки нужны в любом случае.

### D5. Иконки — `lucide-react` через обёртку
`ui-kit/src/icons.ts` реэкспортирует нужные иконки lucide с умолчаниями UI Kit: размер 18, `strokeWidth` 2, `aria-hidden`. Приложения импортируют иконки только из `@synergy/ui-kit/icons`; это закреплено в rule и в eslint `no-restricted-imports`. Файлы `sidepanel/icons.tsx` и `options/telegram/icons.tsx` удаляются.

### D6. Шрифты — variable-поставка из пакета
`@fontsource-variable/raleway`, `onest`, `inter` и `jetbrains-mono` — зависимости пакета. Шрифты подключаются в `ui-kit/styles/fonts.css`. Статические `@fontsource/*` CC и их импорты удаляются. Поставка локальная, это удовлетворяет CSP MV3.

### D7. Режимы раскладки
`ui-kit/src/layout/`:
- `LayoutMode = 'desktop' | 'tablet' | 'mobile'`;
- `WIDE_BREAKPOINT = 640`;
- `layoutModeForWidth(width)`;
- `useViewportWidth` (перенос `use-viewport-size.ts`);
- `LayoutModeProvider` и `useLayoutMode()`.

CC оборачивает приложение в провайдер с фиксированным `'desktop'`, MH вычисляет режим по ширине панели. Компоненты пакета читают режим из контекста и меняют только компоновку. `paneVisibility` и `tasksPaneVisibility` MH переписываются на режим и переезжают в пакет как чистые функции.

### D8. Компоненты фич презентационные, данные и платформа — в приложениях
Пакет экспортирует компоненты с props вида `data + callbacks`, без запросов, store и платформенных API. Каждое приложение держит тонкий контейнер, который:
- берёт данные (TanStack Query / Zustand в CC, хуки MH) и передаёт их в компонент;
- реализует действия через свой API-слой;
- реализует платформенные вещи: открыть ссылку (`shell.openExternal` / `chrome.tabs.create`), сохранить файл, системные уведомления.

Это проще адаптерных интерфейсов на весь пакет и не тянет в пакет различия транспорта. Единственный общий «порт» — загрузка файла для вложений (D10): там логика состояния нетривиальна и должна быть одной.

Альтернатива — общий слой API с внедряемым транспортом. Он отвечает за данные, а не за вид, и сильно увеличивает объём; вынесен из скоупа.

### D9. Чат — на примитивах assistant-ui, runtime в приложении
`AssistantRuntimeProvider` с `useAgUiRuntime` остаётся в приложении, так как агент и транспорт разные. Компоненты пакета рендерятся внутри провайдера и используют примитивы и хуки assistant-ui:
- **`Thread`** — `ThreadPrimitive.Root/Viewport/Messages/Empty`; пустое состояние, кнопка «к новым сообщениям», `RunNotice` для ошибок и повтора;
- **`AssistantMessage` / `UserMessage`** — `MessagePrimitive.Parts` с markdown;
- **`ToolGroup`** — по образцу `ToolGroup` / `ToolFallback` assistant-ui, через `components.ToolGroup` / `tools.Fallback` в `MessagePrimitive.Parts`. Логика статусов — из MH `ToolCallGroup`, вид — по мастерам `Tool Group` / `Tool Call Row` / `Tool Call Details`, имя инструмента набрано `--font-mono`;
- **`RunningIndicator`** — `useAuiState(s => s.thread.isRunning)` плюс серверный флаг из props: CC и MH оба умеют узнавать, что запуск идёт на сервере;
- **`NextSteps`** — `classifyAnswer` и наборы подсказок переезжают из MH в `ui-kit/src/chat/next-steps.ts`; клик вызывает `onSend` из props, приложение отправляет сообщение через runtime;
- **`Composer`** — `ComposerPrimitive.Root/Input/Send/Cancel`, кнопка прикрепления, плитки вложений в стиле `ComposerAttachments`, отправка круглой кнопкой со стрелкой.

`QuickSearchForm` остаётся в MH и только переводится на примитивы пакета.

### D10. Вложения: общий хук с портом загрузки
`use-composer-attachments.ts`, `FileCard`, `ComposerAttachments`, `MessageAttachments` и разбор `message-files.ts` переезжают из CC в пакет. Хук принимает порт:

```
type FileUploadPort = {
  upload(file, { onProgress, signal }): Promise<{ fileId }>
}
```

Скачивание — callback `onDownload(file)` из props. Обёртка агента `withFileIds` (добавляет id файлов в запуск) переезжает в пакет как чистая функция над `HttpAgent`, оба приложения применяют её к своему агенту.

В MH:
- порт реализуется XHR-загрузкой на `/files` с Bearer из `authFetch`-токена;
- скачивание — получение подписанной ссылки и `chrome.downloads.download({ url, filename })` под исходным именем; в `manifest.config.ts` добавляется разрешение `downloads`. Файл виден в загрузках Chrome, большие файлы не держатся в памяти панели;
- CORS бэкенда уже пускает `chrome-extension://*` (`AUTH_ALLOWED_ORIGINS`), правок на бэкенде нет.

### D11. Оболочка
В пакете:
- `AppFrame` — подложка `surface-sunken`, отступ 10, белые панели с радиусом 20 и `shadow-panel`;
- `NavRail` и `TabBar` — плавающая капсула. Набор пунктов и активный раздел приходят через props;
- `PanelHeader` — капсулы и круглые кнопки;
- `ProfileButton` + `ProfileMenu`;
- `NotificationsButton`, `NotificationsList`, `NotificationToast`.

`AppFrame` выбирает рейл или таб-бар по `LayoutMode`. CC отдаёт секцию из `ui.store`, MH — из `active-section.ts`.

Меню профиля в MH новое. «Выйти» вызывает `auth-service.logout` MH, «Сменить пароль» открывает общий `ChangePasswordDialog`, «Telegram» открывает раздел Telegram в панели. Раздел на странице настроек остаётся и использует те же компоненты.

### D12. Задачи
Общие компоненты:
- `TaskList`, `TaskRow`, `StatusBadge`, `DeadlineLabel`, `TaskDetails`, `TaskFormFields`, `UserPicker`, `AttachmentList`;
- `TaskFilters` — `SegmentedControl` + меню «Ещё»: состав видимых сегментов зависит от `LayoutMode`, переполнение уходит в `Menu`.

Контейнер создания свой в каждом режиме: `Dialog` в CC, `Sheet` в MH с быстрым полем названия и раскрывающимися полями. Поля внутри общие.

В MH появляются загрузка и удаление вложений задачи. Используется тот же API, что в CC, и `FileUploadPort` из D10.

Представление по умолчанию в обоих приложениях — «Мои». Вид «Готовые» MH заменяется фильтром статуса «Готово».

### D13. Тёмная тема удаляется
Из CC удаляются:
- `.dark {}` и `@custom-variant dark`;
- классы `dark:*`;
- `ui.store.dark` / `toggleDark`;
- переключение класса в `App.tsx` и кнопка в `NavRail`.

В пакете тёмных вариантов нет.

### D14. TypeScript и линт
MH переходит на TypeScript ^7.0.2, как в CC, отдельной первой задачей. Конфиги eslint и prettier MH поднимаются в корень и распространяются на `ui-kit` и CC; у CC появляется скрипт `lint`. В пакете свои `test`, `typecheck`, `lint`.

### D15. Структура пакета
```
ui-kit/
  package.json   @synergy/ui-kit, exports, peerDependencies
  CLAUDE.md
  styles/        tokens.css, fonts.css, base.css, index.css
  src/
    index.ts     публичный API
    icons.ts
    lib/cn.ts
    layout/      LayoutMode, провайдер, хуки, pane-visibility
    primitives/  Button, Input, …, SegmentedControl (+ .test.tsx)
    shell/       AppFrame, NavRail, TabBar, PanelHeader, ProfileMenu
    notifications/
    chat/        Thread, messages, ToolGroup, RunningIndicator, NextSteps,
                 Composer, attachments/, chat-list/
    tasks/
    telegram/
    auth/        LoginForm, ChangePasswordDialog, ConnectionError, AuthBrand
```

Глубокие импорты `@synergy/ui-kit/src/...` из приложений запрещены через eslint `no-restricted-imports`.

### D16. Макеты до кода
Первая группа работает в Pencil (`mcp__pencil__*`):
1. Мастер-компоненты из фреймов «Компоненты» досок 01–06 и доски `ZqCio` переносятся в `design-kit.lib.pen` под именами, совпадающими с именами компонентов пакета (`Tool Group`, `Chat List Item`, `Nav Rail`, `Tab Bar`, `Profile Menu`, `Task Row`, `Segmented Control` …). Экраны переводятся на экземпляры UI Kit.
2. Дорисовываются недостающие состояния из proposal.
3. Список устаревших фреймов CC и MH показывается пользователю, после согласования фреймы удаляются.
4. Пишется `.claude/rules/design-system.md`.

Кодовые группы стартуют после этого, чтобы Node ID в `frames` были окончательными.

### D17. Документация и rule
- **Новый `.claude/rules/ui-kit.md`** (пути `ui-kit/**`, `control-center/src/renderer/**`, `manager-helper/src/**`):
  - вид — только из `@synergy/ui-kit`;
  - запрещены локальные токены, hex в классах, прямые `lucide-react` и `radix-ui` в приложениях;
  - чат строится на примитивах assistant-ui;
  - один компонент — разная компоновка по `LayoutMode`;
  - платформенный код всегда в приложении;
  - новая UI-функциональность чата и оболочки делается в пакете и подключается в оба приложения;
  - тёмной темы нет.
- **`CLAUDE.md`:**
  - корень — `ui-kit/` в таблицах состава и команд, установка из корня;
  - CC и MH — что лежит в контейнерах;
  - новый `ui-kit/CLAUDE.md` — структура, таблица токенов «старое → новое», как добавить компонент.
- **`.claude/rules/frontend-ui-verification.md`** — в `paths` добавляется `ui-kit/**`: правка пакета проверяется в обоих приложениях.

### D18. Подписанные ссылки на вложения задач
Вложения задач хранятся модулем `tasks` по `storageKey`, а не модулем `files`. Поэтому ссылка `files/:id/download-link` к ним не подходит. Решение:
- в `tasks` добавляются `CreateAttachmentDownloadLinkUseCase` (проверка `TaskAccessPolicy.canRead` и принадлежности вложения задаче) и `DownloadAttachmentByTokenUseCase`;
- порт `AttachmentDownloadTokenPort` (`sign(attachmentId, ttlSec)` и `verify(token, attachmentId)`) живёт в домене `tasks`. Адаптер — JWT с секретом `FILES_DOWNLOAD_TOKEN_SECRET` и TTL `FILES_DOWNLOAD_LINK_TTL_SEC`, по образцу `files/infrastructure/jwt/download-token.service.ts`. В токене есть claim `aud: 'task-attachment'`, чтобы токен файла чата не подходил к вложению, и наоборот;
- маршруты `POST /tasks/:id/attachments/:attachmentId/download-link` и публичный (`@Public()`) `GET /tasks/:id/attachments/:attachmentId/content?token=`;
- без секрета запрос ссылки отвечает 503 `TASK_ATTACHMENT_LINKS_UNAVAILABLE`;
- MH скачивает вложение задачи через ссылку и `chrome.downloads.download`, как файлы чата. CC не меняется: он скачивает через `cc-api://` и сохраняет файл средствами Electron.

Импорт адаптера из модуля `files` отклонён: он нарушает границы модулей. Отдельный общий модуль подписи ради двух адаптеров — избыточен.

## Risks / Trade-offs

- **[Риск] Единый лок-файл обновит транзитивные зависимости.** → Отдельная первая кодовая задача: workspaces + TS 7 в MH, полный прогон тестов и typecheck обоих приложений, коммит до любых правок UI.
- **[Риск] Два экземпляра `@assistant-ui/react`, и контекст runtime не виден компонентам пакета.** → `peerDependencies` и проверка `npm ls @assistant-ui/react` (одна копия) в той же задаче; интеграционный тест пакета рендерит `Thread` внутри `AssistantRuntimeProvider` с fake-агентом.
- **[Риск] Массовая замена классов shadcn в CC пропустит места.** → После замены поиск `(bg|text|border|ring)-(primary|secondary|muted|accent|destructive|foreground|background|card|input|popover)` должен давать пустой результат; плюс проверка экранов через `electron-stagewright`.
- **[Риск] Тесты приложений завязаны на разметку.** → Компоненты пакета сохраняют роли и доступные имена; тесты, проверяющие классы, переписываются на роли. Тесты компонентов переезжают в пакет вместе с компонентами.
- **[Риск] Новое разрешение `downloads` при обновлении расширения.** → Chrome покажет запрос разрешения; это ожидаемо, фиксируется в `manager-helper/CLAUDE.md`.
- **[Риск] Tailwind не увидит классы пакета при неверном `@source`.** → Скриншот-проверка в обоих приложениях после подключения; путь описан в `ui-kit/CLAUDE.md`.
- **[Компромисс] Объём на верхней границе: около 45 задач.** → Выбран один change. Волны: пакет → (MH ‖ CC) по фичам; приложения переходят независимо.
- **[Компромисс] CC теряет тёмную тему (BREAKING).** → Сознательное решение пользователя.

## Migration Plan

1. Макеты: мастера в UI Kit, недостающие состояния, удаление устаревших фреймов, rule `design-system.md`.
2. Корень: workspaces, один лок-файл, TS 7 в MH, линт в корне. Тесты и типы зелёные, UI не менялся.
3. Пакет: токены, шрифты, иконки, layout, примитивы. Затем оболочка, чат, задачи, уведомления, Telegram, авторизация — параллельно.
4. MH и CC переходят на пакет по фичам независимо: оболочка и авторизация, чат, задачи и уведомления, Telegram. В CC — удаление тёмной темы и shadcn, в MH — вложения и меню профиля.
5. Документация и rule, сквозная проверка обоих приложений по макетам.

Откат: каждая группа — отдельный коммит. Переход каждого приложения откатывается независимо.
