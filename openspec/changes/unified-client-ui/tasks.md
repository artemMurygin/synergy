## 1. design: мастера в UI Kit, недостающие состояния, правило дизайн-системы
> track: design
> depends: —
> specs: client-ui-kit → «UI Kit как эталон»
> arch: —
> files: design/design-kit.lib.pen; design/synergy-design.pen; openspec/changes/unified-client-ui/ui-design.md; .claude/rules/design-system.md; CLAUDE.md
> frames: ZqCio; N5zJ7; CC227; RSL0e; d34K1; QE24F; o1X1US

- [ ] 1.1 Перенести мастер-компоненты из фреймов «Компоненты» (`TQnaP`, `VKVbI`, `crdSZ`, `ghJgQ`, `wn9D5`) и `F6L43` доски `ZqCio` в `design/design-kit.lib.pen`, используя имена из ui-design.md, раздел «Новые компоненты UI Kit». Экраны досок 01–06 перевести на экземпляры UI Kit, а Node ID мастеров вписать в эту таблицу ui-design.md. Без тестов: работа в макетах. Готово, когда фреймы «Компоненты» на досках пусты или удалены, а скриншоты экранов `VHpuS`, `WxAFh`, `Elt3T`, `qryQB`, `Nk6nR`, `YDMzw` не изменились
- [x] 1.2 Дорисовать состояния в секциях своих досок, по три формата на состояние, где меняется разметка. Без тестов: макеты. Готово, когда Node ID записаны в ui-design.md («Ключевые состояния экранов»), а проверка layout не нашла clipping. Состояния:
  - Telegram: «бот не настроен» и «получаем ссылку…» (`QE24F`);
  - ошибки загрузки списка и статусов задач (`RSL0e`, секция `c0aEh5`);
  - «Повторяем…» на ошибке связи (`o1X1US`, `ZHyFP`);
  - тосты ошибок переименования и удаления чата (`CC227`, `ddf2k`).
- [x] 1.3 Пересобрать переход «уведомление → задача» на доске `d34K1` из карточки задачи доски `RSL0e` вместо временного компонента `j0YMMO`, временный компонент удалить. Без тестов: макеты. Готово, когда `j0YMMO` нет в документе
- [x] 1.4 Составить список устаревших фреймов CC и MH в `synergy-design.pen` (старые экраны, `DILPP`, `tD0BP` и прочие дубли) с Node ID и причиной. Фреймы Portal и презентаций в список не входят. Записать его в ui-design.md, раздел «Кандидаты на удаление». **Не удалять**: удаление после согласования с пользователем, вопрос вернуть в `questions`. Отдельно отметить, что UI Kit «Дизайн-система» (`t:XyiTL`) перекрывает старые фреймы. Без тестов: документ
- [x] 1.5 Написать `.claude/rules/design-system.md` (paths: `design/**`), без тестов: документация. Готово, когда файл есть, а строка `design/` в корневом `CLAUDE.md` описывает новую структуру. Содержание правила:
  - структура досок «Единый дизайн · 01–06»;
  - режимы Desktop, Tablet, Mobile;
  - словарь токенов UI Kit (имена без префикса `t:` = имена CSS-токенов кода);
  - «компоненты только из UI Kit», «только светлая тема»;
  - assistant-ui как основа элементов чата;
  - порядок согласования правок дизайна.

## 2. Корень: npm workspaces, TypeScript 7 в MH, общий линт
> track: integration
> depends: —
> specs: —
> arch: —
> files: package.json; package-lock.json; control-center/package.json; control-center/package-lock.json; manager-helper/package.json; manager-helper/package-lock.json; manager-helper/tsconfig*.json; eslint.config.mjs; .prettierrc*; manager-helper/eslint.config.mjs
> frames: —

- [x] 2.1 Корневой `package.json`: `private: true`, `workspaces: ["ui-kit", "control-center", "manager-helper"]`. Удалить `control-center/package-lock.json` и `manager-helper/package-lock.json`, выполнить `npm install` в корне. `backend/` и `portal/` не трогать. Без тестов: конфигурация. Готово, когда:
  - `npm ls react @assistant-ui/react` показывает по одной копии;
  - в `control-center` и `manager-helper` проходят `npm test` и `npm run typecheck` с тем же результатом, что до изменений.
- [x] 2.2 Перевести MH на `typescript ^7.0.2`, как в CC, и исправить новые ошибки типов без `any` и `as`. Без тестов: обновление инструмента. Готово, когда в `manager-helper` зелёные `npm run typecheck`, `npm test` и `npm run lint`
- [x] 2.3 Поднять конфиги eslint (flat, `strictTypeChecked`, react-hooks) и prettier из MH в корень. MH и будущий `ui-kit` используют корневой конфиг. В CC добавить скрипт `lint`. Существующие нарушения CC переносятся в правила `warn` с комментарием «чистится в группах 8–9», и CC в регрессии на lint не проверяется. Без тестов: конфигурация. Готово, когда `npm run lint` в MH зелёный, а в CC запускается

## 3. ui-kit: каркас пакета, токены, шрифты, иконки, режимы раскладки
> track: ui-kit
> depends: 1, 2
> specs: client-ui-kit → «Режимы раскладки»; client-ui-kit → «Только светлая тема»; client-ui-kit → «Шрифты без сети»; client-ui-kit → «UI Kit как эталон»
> arch: Features/ui-kit/styles; Features/ui-kit/src/layout; Features/ui-kit/src/icons.ts; Hooks/useLayoutMode; Hooks/useViewportWidth
> files: ui-kit/package.json; ui-kit/tsconfig.json; ui-kit/vitest.config.ts; ui-kit/CLAUDE.md; ui-kit/styles/**; ui-kit/src/index.ts; ui-kit/src/icons.ts; ui-kit/src/lib/cn.ts; ui-kit/src/layout/**
> frames: —

- [x] 3.1 Каркас `ui-kit/`, без тестов: конфигурация. Готово, когда `npm run typecheck` и `npm test` в `ui-kit` проходят. Состав:
  - `package.json` с именем `@synergy/ui-kit`, `exports` (`.`, `./icons`, `./styles.css`) на исходники;
  - `peerDependencies`: react, react-dom, @assistant-ui/react;
  - зависимости: radix-ui, class-variance-authority, clsx, tailwind-merge, lucide-react, @fontsource-variable/{raleway,onest,inter,jetbrains-mono};
  - скрипты `test`, `typecheck`, `lint`; vitest + jsdom + Testing Library;
  - `lib/cn.ts`;
  - черновик `ui-kit/CLAUDE.md` со структурой и путём `@source`.
- [x] 3.2 TDD: в `styles/tokens.css` объявлены все переменные UI Kit под именами без префикса `t:`; `fonts.css` подключает четыре шрифта локально; `base.css` задаёт `color-scheme: light`, `body { font-family: var(--font-ui) }` вне слоёв и стили `.markdown`. Список переменных взять через `GetVariables` из `design/design-kit.lib.pen`. Тест: `ui-kit/styles/tokens.test.ts` сверяет список имён токенов с зафиксированным списком из UI Kit и проверяет, что нет `prefers-color-scheme` и `.dark`. Реализация: `ui-kit/styles/{tokens,fonts,base,index}.css`
- [x] 3.3 TDD: обёртка иконок отдаёт lucide с размером 18, `strokeWidth` 2 и `aria-hidden` по умолчанию; переопределения проходят. Тесты: `ui-kit/src/icons.test.tsx`. Реализация: `ui-kit/src/icons.ts`
- [x] 3.4 TDD: режимы раскладки. Тесты: `ui-kit/src/layout/*.test.ts(x)`. Реализация: `ui-kit/src/layout/{layout-mode.tsx,use-viewport-width.ts,pane-visibility.ts}`. Проверяется:
  - `layoutModeForWidth(639) = 'mobile'`, `(640) = 'tablet'`;
  - провайдер с фиксированным `'desktop'` не меняет режим при любой ширине;
  - режим по ширине меняется при resize без размонтирования детей;
  - `chatPaneVisibility` и `tasksPaneVisibility` повторяют поведение MH `paneVisibility` и `tasksPaneVisibility`.

## 4. ui-kit: примитивы
> track: ui-kit
> depends: 3
> specs: client-ui-kit → «Одинаковый вид базовых элементов»; client-ui-kit → «Доступность базовых элементов»
> arch: Features/ui-kit/src/primitives
> files: ui-kit/src/primitives/**; ui-kit/src/index.ts
> frames: o1X1US; RSL0e

- [x] 4.1 TDD: `Button` (варианты `primary`, `secondary`, `ghost`, `icon-round`; disabled; у `icon-round` обязателен `aria-label` по типам), `Input` с состоянием ошибки и связанным текстом ошибки (`aria-describedby`), `PasswordField` с показом и скрытием пароля, `Textarea`. Тесты: `ui-kit/src/primitives/{Button,Input,PasswordField,Textarea}.test.tsx`. Вёрстка по мастерам UI Kit, сверка по форме входа `xvSk3`
- [x] 4.2 TDD: `Switch` (роль `switch`, клавиша Space), `InlineConfirm` (подтвердить или отменить, Escape отменяет), `Badge` (варианты статусов), `Skeleton`, `SegmentedControl` (роль `radiogroup`, стрелки двигают выбор, слот для пункта-меню «Ещё»). Тесты: `ui-kit/src/primitives/*.test.tsx`. Сверка `SegmentedControl` с View Segments на `Nk6nR`
- [x] 4.3 TDD: `Dialog`, `Popover`, `Menu`, `Sheet` на radix удерживают фокус, закрываются по Escape и возвращают фокус на открывший элемент; у `Sheet` есть сторона `bottom` для мобильного режима. Тесты: `ui-kit/src/primitives/{Dialog,Popover,Menu,Sheet}.test.tsx`

## 5. ui-kit: оболочка, уведомления, авторизация, Telegram
> track: ui-kit
> depends: 4
> specs: client-ui-kit → «Навигация между разделами»; client-ui-kit → «Кнопка и меню профиля»; client-ui-kit → «Уведомления внутри приложения»; client-ui-kit → «Режимы раскладки»
> arch: Features/ui-kit/src/shell; Features/ui-kit/src/notifications; Features/ui-kit/src/auth; Features/ui-kit/src/telegram; UI-компоненты/AppFrame; UI-компоненты/NavRail / TabBar; UI-компоненты/ProfileMenu; UI-компоненты/NotificationsList; UI-компоненты/LoginForm
> files: ui-kit/src/shell/**; ui-kit/src/notifications/**; ui-kit/src/auth/**; ui-kit/src/telegram/**; ui-kit/src/index.ts
> frames: VHpuS; WxAFh; Elt3T; TLMEl; txD2J; tx6uv; SJ0NJ; DNt8I; eKukg; xvSk3; IDTFu; kW2AT; Pd6db; ZHyFP; JLayI; b8m3B; G2zsX; STkbU; nCcY1

- [x] 5.1 TDD: `AppFrame` в режимах `desktop` и `tablet` показывает `NavRail`, в `mobile` — плавающий `TabBar` и нижний отступ под него. Активный пункт помечен `aria-current`, выбор вызывает `onSectionChange`, бейдж пункта отображается. Тесты: `ui-kit/src/shell/{AppFrame,NavRail,TabBar}.test.tsx`. Вёрстка по `VHpuS` (rail `IINg3`), `WxAFh` (`UqH0z`), `Elt3T` (`CEpvB`); сверка в этой же задаче
- [x] 5.2 TDD: `PanelHeader` (капсулы и круглые кнопки), `ProfileButton` и `ProfileMenu`. Меню показывает имя, «Telegram» со статусом (пункт скрыт без `telegram`), «Сменить пароль» и «Выйти» с подтверждением; закрывается по Escape и клику вне меню. Тесты: `ui-kit/src/shell/{PanelHeader,ProfileMenu}.test.tsx`. Вёрстка по `TLMEl`, `txD2J`, Profile Menu `bfjks`
- [x] 5.3 TDD: `NotificationsButton` скрывает 0 и показывает `99+` при 150 (`formatBadgeCount`). `NotificationsList` различает состояния loading, empty, error и ready, при обновлении не схлопывает данные, вызывает `onOpen`, `onReadAll`, `onLoadMore`, `onRetry`. `NotificationToast` скрывается по таймеру. Тесты: `ui-kit/src/notifications/*.test.tsx`. Вёрстка по `tx6uv`, `SJ0NJ`, `DNt8I`, `eKukg`
- [x] 5.4 TDD: `AuthBrand` с логотипом «Синергия» (SVG из `design/assets/synergy-logo.svg`), `LoginForm` (валидация пустых полей, `pending`, ошибка, слот `footer`), `ChangePasswordDialog` (обязательный — без закрытия, добровольный — диалог или `Sheet` по режиму), `ConnectionError` с «Повторить» и состоянием «Повторяем…», `RestoringScreen`. Тесты: `ui-kit/src/auth/*.test.tsx`. Вёрстка по `xvSk3`, `IDTFu`, `kW2AT`, `Pd6db`, `ZHyFP`
- [x] 5.5 TDD: панели Telegram:
  - `TelegramConnectPanel`: состояния «не подключён», «получаем ссылку…», «ожидание подтверждения», ошибки;
  - `TelegramLinkedPanel`: username, время привязки, переключатель уведомлений;
  - `TelegramUnlinkConfirm`;
  - `TelegramMenuItem`.

  Открытие ссылки — через callback. Тесты: `ui-kit/src/telegram/*.test.tsx`. Вёрстка по `JLayI`, `b8m3B`, `G2zsX`, `STkbU`, `nCcY1`

## 6. ui-kit: чат
> track: ui-kit
> depends: 4
> specs: chat-thread-ui → «Одинаковый чат в обоих приложениях»; chat-thread-ui → «Ход работы агента»; chat-thread-ui → «Подсказки следующего шага»; chat-thread-ui → «Пустой чат»; chat-thread-ui → «Ошибка и повтор»; chat-thread-ui → «Остановка ответа»; chat-attachments-ui → «Вложения в обоих приложениях»; chat-session-switcher → «Список чатов в обоих приложениях»; chat-session-switcher → «Скрытие списка чатов»; client-ui-kit → «Шрифты без сети»
> arch: Features/ui-kit/src/chat; Features/ui-kit/src/chat/attachments; Features/ui-kit/src/chat/chat-list; UI-компоненты/Thread; UI-компоненты/ToolGroup; UI-компоненты/NextSteps; UI-компоненты/Composer; UI-компоненты/ChatList; Hooks/useComposerAttachments; Hooks/useChatListCollapsed
> files: ui-kit/src/chat/**; ui-kit/src/index.ts
> frames: VHpuS; b4IMkD; WxAFh; Elt3T; hTZ3b; IY5Ex; y2PJn; G9GQ6f; pUB2g; D4V94; ddf2k; ZqCio

- [x] 6.1 TDD: `Thread` на `ThreadPrimitive` и `MessagePrimitive`. Тесты: `ui-kit/src/chat/Thread.test.tsx` с `useLocalRuntime` и fake-адаптером. Вёрстка по `VHpuS`, `IY5Ex`, `G9GQ6f`, `pUB2g`; текст сообщений набран `--font-chat`. Проверяется:
  - пустое состояние для нового чата;
  - сообщения пользователя и агента, markdown;
  - `RunNotice` ошибки с «Повторить» (`onRetry`) и пометка остановленного ответа;
  - «Остановить» вместо отправки, пока идёт запуск (`onCancel`);
  - `NewMessageButton`;
  - ошибка соединения с текстом из props.
- [x] 6.2 TDD: `ToolGroup` по образцу `ToolGroup` / `ToolFallback`. Тесты: `ui-kit/src/chat/{ToolGroup,tool-status}.test.tsx`. Реализация: `ToolGroup.tsx`, `tool-status.ts`; логику статусов перенести из `manager-helper/src/sidepanel/ToolCallGroup.tsx`. Вёрстка по `PECc1`, `elTf3`, `x6HSl`; имя инструмента набрано `--font-mono`. Проверяется:
  - свёрнута по умолчанию;
  - общее состояние «выполняется» или «N вызовов · готово»;
  - строки с именем инструмента и статусом, включая «ошибку»;
  - раскрытие строки показывает аргументы и результат;
  - подключение через `components.ToolGroup` и `tools.Fallback` в `MessagePrimitive.Parts`.
- [x] 6.3 TDD: `RunningIndicator` показывается при `thread.isRunning` или `serverRunning`. `NextSteps` с перенесёнными из MH `classifyAnswer` и наборами: подборка → три подсказки, карточка → три, прочее → ничего. Во время ответа и после ошибки подсказки скрыты, клик вызывает `onSend(query)`. Тесты: `ui-kit/src/chat/{RunningIndicator,NextSteps,next-steps}.test.ts(x)`. Вёрстка по `GHzRg`, `y2PJn`
- [x] 6.4 TDD: вложения перенести из CC вместе с тестами: `useComposerAttachments` с `FileUploadPort` (прогресс, отмена через `signal`, ошибка с «повторить» и «убрать», лимит 5 файлов, блокировка отправки во время загрузки), `withFileIds`, `message-files`, `FileCard`, `ComposerAttachments` (плитки: иконка или миниатюра, имя, размер, «убрать»), `MessageAttachments` с `onDownload` и пометкой «Срок хранения истёк». Тесты: `ui-kit/src/chat/attachments/*.test.ts(x)`. Источник: `control-center/src/renderer/src/features/chat/{use-composer-attachments.ts,ComposerAttachments.tsx,MessageAttachments.tsx,FileCard.tsx,message-files.ts}`. Вёрстка по `jL3uw`
- [x] 6.5 TDD: `Composer` и `ChatList`. Тесты: `ui-kit/src/chat/{Composer,chat-list/*}.test.tsx`. Вёрстка по `Gt1Xk`, `jmF1A`, `p46LHd`, `b4IMkD`, `hTZ3b`, `D4V94`, `ddf2k`. Проверяется:
  - `Composer`: поле, кнопка прикрепления, перетаскивание файлов, круглая кнопка отправки со стрелкой с `aria-label`; кнопок микрофона и «Изменить» нет;
  - `ChatList`: компактные строки (название, время, индикатор идущего ответа), создание, inline-переименование, удаление с подтверждением, состояния loading, empty, error;
  - `useChatListCollapsed`: скрытие списка, состояние хранится в sessionStorage.

## 7. ui-kit: задачи
> track: ui-kit
> depends: 4
> specs: tasks-desktop-ui → «Одинаковые компоненты задач в обоих приложениях»; tasks-desktop-ui → «Фильтры и поиск»; tasks-extension-ui → «Мои задачи»; tasks-extension-ui → «Детали задачи»; tasks-extension-ui → «Загрузка и удаление вложений задачи»
> arch: Features/ui-kit/src/tasks; UI-компоненты/TaskFilters; UI-компоненты/TaskDetails
> files: ui-kit/src/tasks/**; ui-kit/src/index.ts
> frames: qryQB; Nk6nR; IvT8b; YDMzw; pXHcl; YjjPE; FPm0J; c0aEh5

- [x] 7.1 TDD: `TaskRow` (название, статус, ответственный, дедлайн, «Просрочено» текстом, число вложений), `StatusBadge`, `DeadlineLabel` (`deadline.ts`), `TaskList`. `TaskList` различает первичную загрузку и обновление и показывает состояния пусто, ничего не найдено, ошибка с «Повторить». Тесты: `ui-kit/src/tasks/{TaskRow,TaskList,deadline}.test.ts(x)`. Вёрстка по `qryQB`, `YDMzw`, `c0aEh5`
- [x] 7.2 TDD: `TaskFilters` и `task-views.ts`. Тесты: `ui-kit/src/tasks/{TaskFilters,task-views}.test.ts(x)`. Вёрстка по `qryQB`, `Nk6nR`, `IvT8b`, `YDMzw`. Состав сегментов по режиму:
  - desktop — все пять представлений;
  - tablet — «Все», «Мои», «Ещё»; в меню «Я наблюдаю», «Созданные мной», «Просрочено»;
  - mobile — «Все», «Мои», «Просрочено» со счётчиком, «Ещё».

  Если выбрано представление из меню, выбранным показан сегмент «Ещё». Статус и сортировка на второй строке в tablet и mobile, поиск с задержкой.
- [x] 7.3 TDD: `TaskDetails` (правка полей через `onPatch`, смена статуса одним действием, удаление с подтверждением, «Назад» только при `onBack`), `TaskFormFields`, `UserPicker` (поиск, кнопка «Я», лимит 50 наблюдателей), `AttachmentList` (скачать, загрузить с прогрессом, удалить с подтверждением, ошибки размера и типа), `TaskNotFound`. Тесты: `ui-kit/src/tasks/{TaskDetails,TaskFormFields,UserPicker,AttachmentList}.test.tsx`. Вёрстка по `pXHcl`, `YjjPE`, `FPm0J`

## 8. control-center: стили, тема, оболочка, авторизация, Telegram
> track: control-center
> depends: 5
> specs: client-ui-kit → «Только светлая тема»; client-ui-kit → «Навигация между разделами»; client-ui-kit → «Кнопка и меню профиля»; client-ui-kit → «Уведомления внутри приложения»; client-ui-kit → «UI Kit как эталон»; tasks-desktop-ui → «Доступность и клавиатура»
> arch: Pages/AppShell (CC); Pages/AuthGate (CC)
> files: control-center/package.json; control-center/src/renderer/src/index.css; control-center/src/renderer/src/main.tsx; control-center/src/renderer/src/App.tsx; control-center/src/renderer/src/stores/ui.store.ts; control-center/src/renderer/src/layouts/{AppShell,NavRail}.tsx; control-center/src/renderer/src/features/{auth,notifications,telegram}/**
> frames: VHpuS; TLMEl; txD2J; tx6uv; SJ0NJ; DNt8I; xvSk3; IDTFu; kW2AT; Pd6db; ZHyFP; JLayI; G2zsX

- [x] 8.1 Подключить `@synergy/ui-kit`: в `index.css` импорт `@synergy/ui-kit/styles.css` и `@source` на `ui-kit/src`. Удалить из CC:
  - токены `:root`, `.dark`, `@theme inline`, `@custom-variant dark`;
  - статические `@fontsource/*`.

  Классы shadcn-семантики заменить на токены UI Kit по таблице из `ui-kit/CLAUDE.md`, приложение обернуть в `LayoutModeProvider mode="desktop"`. Без тестов: стили. Готово, когда:
  - поиск `(bg|text|border|ring)-(primary|secondary|muted|accent|destructive|foreground|background|card|input|popover)` и `dark:` в `src/renderer` пуст;
  - `npm test` и `typecheck` зелёные.
- [x] 8.2 TDD: тёмной темы нет. В `ui.store` нет `dark` и `toggleDark`, `App.tsx` не ставит класс `.dark`, в рейле нет переключателя темы. Тесты: `control-center/src/renderer/src/{App,stores/ui.store,layouts/NavRail}.test.tsx`
- [x] 8.3 TDD: `AppShell` собран из `AppFrame` и `NavRail` пакета. Секции «Чаты / Задачи» из `ui.store`, бейдж уведомлений, `ProfileMenu` (Telegram, «Сменить пароль», «Выйти» с подтверждением) и уведомления (`NotificationsButton`, `NotificationsList`, `NotificationToast`) — из пакета; данные из прежних хуков. Тесты: `control-center/src/renderer/src/layouts/AppShell.test.tsx`, `features/notifications/*.test.tsx`. Вёрстка по `VHpuS`, `TLMEl`, `tx6uv`, `SJ0NJ`, `DNt8I`, сверка через electron-stagewright
- [x] 8.4 TDD: `AuthGate`, `LoginForm`, `RestoringScreen`, `ConnectionError`, `ChangePasswordDialog` и диалог Telegram используют компоненты пакета; поведение сессии прежнее. Удалить локальные копии `LoginForm.tsx`, `ConnectionError.tsx`, `ChangePasswordDialog.tsx`, `TelegramConnectPanel.tsx`, `TelegramLinkedPanel.tsx`, `telegram-panel-parts.tsx`. Тесты: `features/auth/*.test.tsx`, `features/telegram/*.test.tsx`. Вёрстка по `xvSk3`, `IDTFu`, `kW2AT`, `Pd6db`, `ZHyFP`, `JLayI`, `G2zsX`

## 9. control-center: чат и задачи
> track: control-center
> depends: 6, 7, 8
> specs: chat-thread-ui → «Одинаковый чат в обоих приложениях»; chat-thread-ui → «Ход работы агента»; chat-thread-ui → «Подсказки следующего шага»; chat-session-switcher → «Список чатов в обоих приложениях»; chat-session-switcher → «Скрытие списка чатов»; chat-attachments-ui → «Вложения в обоих приложениях»; tasks-desktop-ui → «Фильтры и поиск»; tasks-desktop-ui → «Одинаковые компоненты задач в обоих приложениях»
> arch: Pages/ChatsScreen (CC); Pages/TasksScreen (CC); Hooks/CC: useFileUploadPort
> files: control-center/src/renderer/src/layouts/ChatLayout.tsx; control-center/src/renderer/src/features/{chat,chat-list,tasks,items}/**; control-center/src/renderer/src/components/**; control-center/components.json; control-center/electron.vite.config.ts; control-center/tsconfig.web.json
> frames: VHpuS; b4IMkD; y2PJn; G9GQ6f; D4V94; ddf2k; qryQB; YjjPE; FPm0J; c0aEh5

- [x] 9.1 TDD: в CC появляются группа вызовов инструментов, `RunningIndicator` с серверным флагом, `NextSteps` над формой (клик отправляет вопрос через runtime) и `Composer` с вложениями через `useFileUploadPort` поверх `lib/backend/xhr-upload`. `ChatThread` собран из `Thread` пакета. Тесты: `features/chat/{ChatThread,use-file-upload-port}.test.tsx` с `fake-agent.ts`: tool-call parts дают `ToolGroup`, ответ-подборка даёт подсказки. Вёрстка по `VHpuS`, `y2PJn`, `G9GQ6f`
- [x] 9.2 TDD: `ChatLayout` собран на `ChatList` пакета с кнопкой скрытия списка: при скрытом списке чат расширяется. Удалить `features/chat-list/*` и локальные копии компонентов чата, перенесённые в пакет. Тесты: `layouts/ChatLayout.test.tsx`. Вёрстка по `VHpuS`, `b4IMkD`, `D4V94`, `ddf2k`
- [x] 9.3 TDD: раздел задач собран из компонентов пакета, представление по умолчанию «Мои», сегменты представлений, детали, создание в `Dialog` с `TaskFormFields`; логика `use-task-filters` и запросы прежние. Удалить перенесённые локальные компоненты задач. Тесты: `features/tasks/*.test.tsx`. Вёрстка по `qryQB`, `YjjPE`, `FPm0J`, `c0aEh5`
- [x] 9.4 Удалить `components/ui/*`, `components.json` и `features/items/`, прямые импорты `lucide-react` заменить на `@synergy/ui-kit/icons`. Включить eslint `no-restricted-imports` для `lucide-react`, `radix-ui`, `@radix-ui/*` и `@synergy/ui-kit/src/*`, снять временные `warn` из группы 2. Без тестов: удаление и конфигурация. Готово, когда в `control-center` зелёные `npm run lint`, `npm test` и `typecheck`, а `grep -rl "lucide-react" src/renderer` пуст

## 10. manager-helper: стили, оболочка, меню профиля, авторизация, Telegram
> track: manager-helper
> depends: 2, 5
> specs: client-ui-kit → «Режимы раскладки»; client-ui-kit → «Навигация между разделами»; client-ui-kit → «Кнопка и меню профиля»; client-ui-kit → «Уведомления внутри приложения»; tasks-extension-ui → «Переключение между чатом и задачами»; notifications-extension-ui → «Уведомления в боковой панели»; telegram-linking-extension-ui → «Вход в Telegram из меню профиля»
> arch: Pages/SidePanelApp (MH); Pages/TelegramScreen (MH); Pages/OptionsPage (MH); Pages/AuthGate (MH)
> files: manager-helper/package.json; manager-helper/src/shared/styles.css; manager-helper/src/sidepanel/{main,App,PanelHeader,SectionSwitch,panel-layout,use-viewport-size,icons}.tsx; manager-helper/src/sidepanel/notifications/**; manager-helper/src/sidepanel/telegram/**; manager-helper/src/options/**; manager-helper/src/shared/auth/ui/**
> frames: WxAFh; Elt3T; hTZ3b; TLMEl; txD2J; tx6uv; SJ0NJ; DNt8I; xvSk3; IDTFu; ZHyFP; JLayI; b8m3B; G2zsX; STkbU

- [x] 10.1 Подключить `@synergy/ui-kit`: в `styles.css` импорт стилей пакета и `@source`. Удалить из MH:
  - собственные токены, `.markdown` и импорты шрифтов из `main.tsx`;
  - `panel-layout.ts` и `use-viewport-size.ts`.

  Классы MH переименовать на токены UI Kit по таблице из `ui-kit/CLAUDE.md`, панель обернуть в `LayoutModeProvider` по ширине; раскладка теперь из пакета. Без тестов: стили и перенос. Готово, когда `npm test`, `typecheck` и `lint` зелёные, а `npx vite build` собирается
- [x] 10.2 TDD: `App.tsx` собран из `AppFrame`: при ширине 700 px рейл «Чаты / Задачи», при 400 px нижний таб-бар; раздел по-прежнему запоминается в `active-section`. `PanelHeader` и уведомления (`NotificationsButton`, `NotificationsList`, `NotificationToast`) взяты из пакета, события по-прежнему идут от service worker через port. Удалить `SectionSwitch.tsx`. Тесты: `sidepanel/App.test.tsx`, `sidepanel/notifications/*.test.tsx`. Вёрстка по `WxAFh`, `Elt3T`, `tx6uv`, `SJ0NJ`, `DNt8I`
- [x] 10.3 TDD: новое меню профиля в панели. «Выйти» с подтверждением вызывает logout MH, и панель показывает вход. «Сменить пароль» открывает `ChangePasswordDialog` пакета. «Telegram» со статусом открывает `TelegramPane` в панели на `use-telegram-link.ts`; если бот не настроен, пункта нет. Страница настроек использует те же панели Telegram и примитивы пакета. Тесты: `sidepanel/{ProfileMenuContainer,telegram/TelegramPane}.test.tsx`, `options/*.test.tsx`. Вёрстка по `TLMEl`, `txD2J`, `JLayI`, `b8m3B`, `G2zsX`, `STkbU`
- [x] 10.4 TDD: `AuthGate`, `LoginForm` (со `ServerLine` в слоте `footer`), `ChangePasswordDialog` и `ConnectionError` берутся из пакета. Удалить `shared/auth/ui/{PrimaryButton,PasswordField}.tsx`, `options/telegram/{Switch,InlineConfirm,icons}.tsx`, `sidepanel/icons.tsx`; иконки — из `@synergy/ui-kit/icons`. Включить eslint `no-restricted-imports`, как в CC. Тесты: `shared/auth/ui/*.test.tsx`. Вёрстка по `xvSk3`, `IDTFu`, `ZHyFP`

## 11. manager-helper: чат и вложения
> track: manager-helper
> depends: 6, 10
> specs: chat-thread-ui → «Одинаковый чат в обоих приложениях»; chat-thread-ui → «Недоступность сервера»; chat-session-switcher → «Адаптация к ширине панели»; chat-session-switcher → «Скрытие списка чатов»; chat-session-switcher → «Список чатов в обоих приложениях»; chat-attachments-ui → «Вложения в обоих приложениях»
> arch: Pages/ChatsScreen (MH); Hooks/MH: useFileUploadPort; Hooks/MH: downloadFile
> files: manager-helper/manifest.config.ts; manager-helper/src/shared/{files-api,agent-client}.ts; manager-helper/src/sidepanel/{ChatPane,ThreadView,AssistantMessage,UserMessage,ErrorMessage,ToolCallGroup,RunningIndicator,RunNotice,NextSteps,ChatSessionList,ChatSessionItem,ChatTitleBar,QuickSearchForm}.tsx; manager-helper/src/sidepanel/attachments/**
> frames: WxAFh; Elt3T; hTZ3b; G9GQ6f; pUB2g; D4V94; jL3uw

- [x] 11.1 TDD: `files-api.ts` в MH. Тесты: `shared/files-api.test.ts`, `sidepanel/attachments/use-file-upload-port.test.ts`. Реализация: `shared/files-api.ts`, `sidepanel/attachments/use-file-upload-port.ts`. Проверяется:
  - `useFileUploadPort` загружает файл XHR на `{backendUrl}/files` с Bearer, отдаёт прогресс и отменяется через `signal`;
  - `downloadFile` получает подписанную ссылку и вызывает `chrome.downloads.download({ url, filename })` с исходным именем;
  - в `manifest.config.ts` добавлено разрешение `downloads`.
- [x] 11.2 TDD: чат панели собран из `Thread`, `ToolGroup`, `RunningIndicator`, `NextSteps` и `Composer` пакета. Вложения: прикрепление, плитки, отправка без текста, файлы в сообщениях со скачиванием; `withFileIds` применён к агенту в `agent-client.ts`. Ошибка соединения предлагает проверить настройки расширения. Удалить локальные `ToolCallGroup`, `RunningIndicator`, `RunNotice`, `NextSteps` и сообщения. Тесты: `sidepanel/ThreadView.test.tsx` или `ChatPane.test.tsx`: файл прикрепляется, id файла уходит в запуск. Вёрстка по `WxAFh`, `G9GQ6f`, `pUB2g`, `jL3uw`
- [x] 11.3 TDD: список чатов на `ChatList` пакета: в планшетном режиме список рядом с чатом и кнопка скрытия, в мобильном — либо чат, либо список, переход кнопкой в верхней панели. Черновик и активный чат сохраняются при переходе через 640 px. `QuickSearchForm` переведена на примитивы пакета, поведение прежнее. Тесты: `sidepanel/ChatPane.test.tsx`, `sidepanel/QuickSearchForm.test.tsx`. Вёрстка по `WxAFh`, `Elt3T`, `hTZ3b`, `D4V94`

## 12. manager-helper: задачи
> track: manager-helper
> depends: 7, 10, 11
> specs: tasks-extension-ui → «Мои задачи»; tasks-extension-ui → «Детали задачи»; tasks-extension-ui → «Загрузка и удаление вложений задачи»; tasks-extension-ui → «Планшетный режим растянутой панели»
> arch: Pages/TasksScreen (MH); Hooks/MH: useTaskAttachments
> files: manager-helper/src/sidepanel/tasks/**; manager-helper/src/shared/tasks-api.ts; manager-helper/src/shared/tasks-view.ts
> frames: Nk6nR; IvT8b; YDMzw; pXHcl; YjjPE; FPm0J; c0aEh5

- [x] 12.1 TDD: раздел задач панели собран из компонентов пакета. По умолчанию «Мои»; сегменты и меню «Ещё» зависят от режима; вид «Готовые» заменён фильтром статуса «Готово». Создание — в `Sheet` с быстрым полем названия и `TaskFormFields`. Детали в планшетном режиме справа с подсказкой «Выберите задачу», в мобильном — отдельным экраном. Удалить перенесённые локальные компоненты. Тесты: `sidepanel/tasks/*.test.tsx`. Вёрстка по `Nk6nR`, `IvT8b`, `YDMzw`, `pXHcl`, `FPm0J`, `c0aEh5`
- [x] 12.2 TDD: `useTaskAttachments` загружает вложение задачи через `FileUploadPort`, проверяет лимиты, показывает ошибки 413 и 422, удаляет с подтверждением и обновляет список; скачивание через `downloadFile`. Тесты: `sidepanel/tasks/use-task-attachments.test.ts`, `shared/tasks-api.test.ts`. Реализация: `use-task-attachments.ts`, `tasks-api.ts`. Вёрстка по `YjjPE`

## 13. Интеграционная проверка и документация
> track: integration
> depends: 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
> specs: client-ui-kit → «UI Kit как эталон»; client-ui-kit → «Режимы раскладки»; client-ui-kit → «Одинаковый вид базовых элементов»
> arch: —
> files: .claude/rules/ui-kit.md; .claude/rules/frontend-ui-verification.md; ui-kit/CLAUDE.md; CLAUDE.md; control-center/CLAUDE.md; manager-helper/CLAUDE.md
> frames: VHpuS; WxAFh; Elt3T; qryQB; Nk6nR; YDMzw; xvSk3

- [x] 13.1 Документация, без тестов. Готово, когда файлы обновлены и ссылки на удалённый `synergy-design-kit.pen` из кода и документации убраны. Состав:
  - новый `.claude/rules/ui-kit.md` по design.md D17;
  - `ui-kit/CLAUDE.md`: структура, таблица токенов «старое → новое» для CC и MH, путь `@source`, как добавить компонент;
  - корневой `CLAUDE.md`: строка `ui-kit/` в таблицах состава и команд, установка из корня;
  - `control-center/CLAUDE.md` и `manager-helper/CLAUDE.md`: контейнеры над пакетом, разрешение `downloads`;
  - в `paths` правила `frontend-ui-verification.md` добавлен `ui-kit/**`.
- [ ] 13.2 Сквозная проверка, без тестов: проверка. Готово, когда расхождения с макетами исправлены или перечислены в итоге. Что проверяется:
  - `npm ls react @assistant-ui/react` — по одной копии;
  - `npm test`, `npm run typecheck`, `npm run lint` в `ui-kit`, `control-center`, `manager-helper`;
  - поиск `lucide-react` и `radix-ui` вне пакета, `dark:`, hex-цветов в классах — пусто;
  - CC через electron-stagewright по `VHpuS` и `qryQB`: отправка вопроса показывает группу инструментов и подсказки;
  - MH после `npx vite build` на ширинах 700 и 400 px по `WxAFh`, `Elt3T`, `Nk6nR`, `YDMzw`: вложение отправляется и скачивается, меню профиля работает;
  - системная тёмная тема не меняет вид.

## 14. backend tasks: подписанная ссылка на вложение задачи
> track: backend
> depends: —
> specs: task-attachments → «Подписанная ссылка на вложение»
> arch: Services/AttachmentDownloadTokenPort; Services/JwtAttachmentDownloadToken; Services/CreateAttachmentDownloadLinkUseCase; Services/DownloadAttachmentByTokenUseCase; Services/TaskAttachmentsController
> files: backend/src/modules/tasks/domain/ports/attachment-download-token.port.ts; backend/src/modules/tasks/infrastructure/jwt/**; backend/src/modules/tasks/application/{create-attachment-download-link,download-attachment-by-token}.use-case*.ts; backend/src/modules/tasks/interface/http/task-attachments.controller*.ts; backend/src/modules/tasks/interface/http/tasks.responses.ts; backend/src/modules/tasks/tasks.module.ts; backend/src/modules/tasks/README.md
> frames: —

- [x] 14.1 TDD: `JwtAttachmentDownloadToken` подписывает токен с `aud: 'task-attachment'` и сроком из `FILES_DOWNLOAD_LINK_TTL_SEC`. `verify` даёт false для просроченного токена, токена другого вложения, подделки и токена файла чата (другой `aud`). Без `FILES_DOWNLOAD_TOKEN_SECRET` адаптер сообщает, что ссылки недоступны. Тесты: `backend/src/modules/tasks/infrastructure/jwt/attachment-download-token.service.spec.ts`. Реализация: порт `domain/ports/attachment-download-token.port.ts` и адаптер по образцу `files/infrastructure/jwt/download-token.service.ts`, без импорта из модуля `files`
- [x] 14.2 TDD: `CreateAttachmentDownloadLinkUseCase` возвращает `{ url: '/tasks/{id}/attachments/{attachmentId}/content?token=…', expiresAt }`. Задачи нет или вложение не из этой задачи — 404; нет доступа на чтение — та же ошибка, что у `DownloadAttachmentUseCase`; нет секрета — `TASK_ATTACHMENT_LINKS_UNAVAILABLE` (503). `DownloadAttachmentByTokenUseCase` при неверном токене — 403 `TASK_ATTACHMENT_TOKEN_INVALID`, если вложения или файла нет — 404, иначе метаданные и поток. Тесты: `backend/src/modules/tasks/application/{create-attachment-download-link,download-attachment-by-token}.use-case.spec.ts`
- [x] 14.3 TDD: маршруты в `TaskAttachmentsController`: `POST /tasks/:id/attachments/:attachmentId/download-link` (Bearer, 200 `{ url, expiresAt }`, Swagger) и публичный `@Public() GET /tasks/:id/attachments/:attachmentId/content?token=` с `Content-Disposition: attachment` (исходное имя), типом содержимого и `X-Content-Type-Options: nosniff`. Тесты: `task-attachments.controller.spec.ts` (HTTP через supertest: ссылка, скачивание без Authorization, 403, 404, 503). Обновить `backend/src/modules/tasks/README.md`

## 15. manager-helper: скачивание вложений задач по подписанной ссылке
> track: manager-helper
> depends: 12, 14
> specs: task-attachments → «Подписанная ссылка на вложение»; tasks-extension-ui → «Детали задачи»
> arch: Hooks/MH: taskAttachmentLink; Hooks/MH: downloadFile
> files: manager-helper/src/shared/tasks-api.ts; manager-helper/src/shared/files-api.ts; manager-helper/src/sidepanel/tasks/**
> frames: YjjPE

- [x] 15.1 TDD: скачивание вложения задачи в MH. Тесты: `manager-helper/src/shared/tasks-api.test.ts`, `manager-helper/src/sidepanel/tasks/*.test.tsx`. Что проверяется:
  - запрос `POST /tasks/{id}/attachments/{attachmentId}/download-link`;
  - `chrome.downloads.download({ url: backendUrl + url, filename: originalName })`;
  - понятная ошибка при 404 и 503;
  - прежний путь `downloadAttachment` + `saveBlob` удалён, если его больше никто не использует;
  - общий код скачивания по ссылке вынесен в `files-api.ts`, чтобы им пользовались и файлы чата.

## 16. Code review
> track: review
> depends: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15

- [ ] 16.1 Code review всех изменений change от base commit по измерениям: соответствие specs/design, стандарты проекта, корректность (выполняет фаза Review workflow `apply-openspec-change`)
- [ ] 16.2 Исправить blocking и major (дефекты поведения — через тест, воспроизводящий ошибку), не больше 2 раундов ревью; оставшиеся minor перечислить в итоге; регрессия зелёная
