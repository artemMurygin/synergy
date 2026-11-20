# UI Design: unified-client-ui

Экраны уже нарисованы и согласованы с пользователем при подготовке change, новые экраны в этом артефакте не рисуются. Здесь они сопоставлены со страницами из architecture.md. Хвосты макета выполняет первая группа tasks.md (design.md, D16):
- мастера переносятся в UI Kit;
- дорисовываются недостающие состояния;
- устаревшие фреймы удаляются.

## Источник дизайна
- **.pen файл:** `design/synergy-design.pen`
- **Доски:** «Единый дизайн · 01–06» и «Компоненты чата». Они стоят колонкой в порядке `ZqCio`, `N5zJ7`, `CC227`, `RSL0e`, `d34K1`, `QE24F`, `o1X1US`.
- **UI Kit:** `design/design-kit.lib.pen`, компоненты с префиксом `t:`.
  - Мастера новых экранов перенесены в UI Kit (`design-kit.lib.pen`), фреймы «Компоненты» (`TQnaP`, `VKVbI`, `crdSZ`, `ghJgQ`, `wn9D5`, `F6L43`) удалены.
  - Группа 1 переносит их в UI Kit. После этого `frames` в tasks.md продолжают указывать на экраны, а мастера ищутся по имени в UI Kit.
- **Режимы:** Desktop (CC), Tablet (MH ≥ 640 px), Mobile (MH < 640 px).

---

## Экраны
| Page (из architecture.md) | Имя фрейма в .pen | Node ID | Breakpoints | Переиспользованные компоненты | Статус |
|---|---|---|---|---|---|
| ChatsScreen (CC) + AppShell (CC) | 01 · Чат · Desktop; Desktop со скрытым списком | `VHpuS`, `b4IMkD` (доска `N5zJ7`) | Desktop | Rail `IINg3`, Chat List `p46LHd`, Tool Group `PECc1`, Composer Box `Gt1Xk`, Chat List Item `jmF1A` | ready |
| ChatsScreen (MH) + SidePanelApp (MH) · tablet | 01 · Чат · Tablet | `WxAFh` | Tablet | Rail `UqH0z`, Chat List `VwA3L`, Header `iShgp`, Tool Group `RQb9x`, Next Steps `GHzRg` | ready |
| ChatsScreen (MH) + SidePanelApp (MH) · mobile | 01 · Чат · Mobile (чат); Mobile (список) | `Elt3T`, `hTZ3b` | Mobile | Top bar `GboTc` / `PZ3P8`, Tab bar `CEpvB` | ready |
| Чат — состояния (обе платформы) | 02 · Чат — состояния | секции `IY5Ex`, `y2PJn`, `G9GQ6f`, `pUB2g`, `D4V94`, `ddf2k` (доска `CC227`) | Desktop / Tablet / Mobile | UI Kit | ready |
| TasksScreen (CC) | 03 · Задачи · Desktop | `qryQB` (секция `wTDH3`) | Desktop | UI Kit | ready |
| TasksScreen (MH) · tablet | 03 · Задачи · Tablet, меню «Ещё» открыто | `Nk6nR`, popover `IvT8b` | Tablet | View Segments, More Filters Popover | ready |
| TasksScreen (MH) · mobile | 03 · Задачи · Mobile (список, детали) | `YDMzw`, `pXHcl` | Mobile | View Segments с «Просрочено» | ready |
| Детали, создание, состояния задач | секции доски `RSL0e` | `YjjPE`, `FPm0J`, `c0aEh5` | все | UI Kit | ready |
| Уведомления (обе платформы) | 04 · Уведомления | `tx6uv`, `SJ0NJ`, `DNt8I`, `eKukg` (доска `d34K1`) | все | UI Kit | ready |
| ProfileMenu (оба), TelegramScreen (MH), Telegram (CC) | 05 · Профиль и Telegram | `TLMEl`, `JLayI`, `b8m3B`, `G2zsX`, `STkbU`, `nCcY1`, `txD2J` (доска `QE24F`) | все | Profile Menu `t:bkkKv` | ready |
| AuthGate (CC, MH) | 06 · Авторизация | `xvSk3` (вход, desktop `No7bu`), `J3k93c`, `IDTFu`, `W46ZRR`, `kW2AT`, `k0ym4w`, `Pd6db`, `ZHyFP` (доска `o1X1US`) | все | Auth Brand `t:FgoeA` | ready |
| OptionsPage (MH) | отдельного макета нет | — | — | примитивы UI Kit и панели Telegram из `QE24F` | — |

Компоненты чата (доска `ZqCio`): Tool Call Row `elTf3`, Tool Group `PECc1`, Tool Call Details `x6HSl`, Chat List Item `jmF1A`, Attachment Tile `jL3uw`, Composer Box `Gt1Xk`, состояния композера `cBn7j`.

## Ключевые состояния экранов
| Экран | Состояние | Как показано | Node ID |
|---|---|---|---|
| Чат | Новый чат, пустое состояние | секция | `IY5Ex` |
| Чат | Агент отвечает: стриминг, инструменты, «Стоп» | секция | `y2PJn` |
| Чат | Ошибка с «Повторить», остановленный ответ | секция | `G9GQ6f` |
| Чат | Сервер недоступен | секция | `pUB2g` |
| Список чатов | Пусто, загрузка, ошибка | секция | `D4V94` |
| Список чатов | Переименование, подтверждение удаления | секция | `ddf2k` |
| Задачи | Загрузка, пусто, ничего не найдено, задача не найдена | секция | `c0aEh5` |
| Уведомления | Загрузка, пусто, ошибка | секция | `eKukg` |
| Telegram | Ошибки | секция | `nCcY1` |
| Авторизация | Восстановление сессии; ошибка связи | секции | `Pd6db`, `ZHyFP` |
| Telegram | «Бот не настроен»: пояснение, кнопка «Подключить» неактивна, шаги скрыты | секция `FKTcZ` (доска `QE24F`): Desktop `Axq6o`, Tablet `Rzs5j`, Mobile `NE2ZB` | `FKTcZ` |
| Telegram | «Получаем ссылку…»: кнопка неактивна с индикатором | секция `lV8TM`: Desktop `IJDjT`, Tablet `OQcRu`, Mobile `yB0vd` | `lV8TM` |
| Задачи | Не удалось загрузить список: блок ошибки и «Повторить» | секция `dp4Xk` (доска `RSL0e`): Desktop `hCyjG`, Tablet `MjBbp`, Mobile `x1qkT` | `dp4Xk` |
| Задачи | Не удалось загрузить статусы: баннер «Повторить», фильтр статуса неактивен | секция `dp4Xk`: Desktop `ggJ9g`, Tablet `y2mQd`, Mobile `SEYG1` | `dp4Xk` |
| Авторизация | Ошибка связи, идёт повтор: кнопка «Повторяем…» | секция `prg71` (доска `o1X1US`): Desktop `Jxh97`, Tablet `oPQJ0`, Mobile `EaDES` | `prg71` |
| Список чатов | Тост ошибки переименования | секция `AdObY` (доска `CC227`): Desktop `kf6jO`, Tablet `b15AM`, Mobile `eZOc2` | `AdObY` |
| Список чатов | Тост ошибки удаления | секция `w87KAw`: Desktop `L4UDYL`, Tablet `Acmjd`, Mobile `X4ary` | `w87KAw` |
| Уведомления | Переход «уведомление → задача»: карточка задачи взята с доски 03 (`Details Body`), `j0YMMO` удалён | секция `VaZH9` (доска `d34K1`): `jIUZ2`, `raaoa`, `BZau2` | `VaZH9` |
| **Не реализуется** | Редактирование сообщения (`W8ash3`), запись и расшифровка голоса в `cBn7j` | заделы на будущие change | — |

## Новые компоненты UI Kit
Все мастера из фреймов «Компоненты» переносятся в `design-kit.lib.pen` в группе 1. Их имена совпадают с компонентами пакета:
- **оболочка:** `Nav Rail`, `Tab Bar`, `Panel Header`, `Profile Menu`;
- **чат:** `Tool Group`, `Tool Call Row`, `Tool Call Details`, `Chat List Item`, `Attachment Tile`, `Composer`, `Next Steps`;
- **задачи:** `Task Row`, `Segmented Control`, `Status Badge`;
- **уведомления:** `Notification Item`, `Notification Toast`;
- **авторизация:** `Auth Brand`.

Мастера перенесены в `design/design-kit.lib.pen`, фрейм «Решение 02 · Клиентские приложения (CC, MH)» (`t:` в синергии-design = префикс импорта библиотеки: в `synergy-design.pen` компонент виден как `t:<Node ID>`). Токены `info-soft`, `warning`, `warning-soft`, `success-soft` добавлены в UI Kit, остальные уже были.

| Компонент (имя в UI Kit) | Node ID в UI Kit | Был на доске (локальный мастер) | Где используется |
|---|---|---|---|
| Tool Call Row | `bmE57` | `elTf3` | Tool Group, чат |
| Tool Call Details | `OAHBx` | `x6HSl` | Tool Group |
| Tool Group | `XGryy` | `PECc1` | чат (все форматы) |
| Attachment Tile | `TICBZ` | `jL3uw` | Composer, сообщения |
| Composer | `pIv9n` | `Gt1Xk` (Composer Box) | чат |
| Chat List Item | `DkqIz` | `jmF1A` | список чатов |
| Chat List Item · Skeleton | `J9OQVd` | `JcKjI` | список чатов, загрузка |
| Chat List Item · Rename | `QVZoq` | `AHBJP` | переименование |
| Chat List Item · Confirm Delete | `p61fs` | `EiUsg` | удаление |
| Edit Composer | `Qi8IW` | `lav2K` | задел, не реализуется |
| Message Notice | `K2JcP` | `DEpLS` | ошибки чата, баннер ошибки статусов |
| Next Steps | `NiMwn` | inline `GHzRg` | чат MH |
| Status Badge | `S5pnPs` | `YW5Zl` (Task Status Badge) | задачи |
| Task Row | `aIWqW` | `Op94j` (Task Row Wide) | задачи, Desktop |
| Task Row · Compact | `McFWZ` | `oLyV6` | задачи, Tablet и Mobile |
| Task Empty State | `c1QCX` | `HCXpU` | задачи, пустые состояния |
| Segmented Control | `j4uCI` (уже был: Segment Switch / Master) | inline | фильтры задач |
| Notification Item | `QKIL8` | `aXdYi` (Notification Row) | уведомления |
| Notification Toast | `kRwI5` | `fpEyH` (Toast) | уведомления, тосты ошибок |
| Notifications Popover | `r16imB` | `R2WNX` | уведомления |
| Profile Menu | `bkkKv` | `bfjks` | меню профиля |
| Telegram Panel · Не подключён | `pHeII` | `ZBS73` | Telegram |
| Telegram Panel · Ожидание | `bGxJG` | `B09OW` | Telegram |
| Telegram Panel · Подключён | `qNfb5` | `r0LqaH` | Telegram |
| Telegram Panel · Ссылка устарела | `wMJAe` | `HvbTz` | Telegram |
| Confirm · Отключить Telegram | `CRQOK` | `niCWM` | Telegram |
| Confirm · Выход | `Coidw` | `u80qLW` | выход |
| Auth Field | `FKQoS` | `DQdwf` | вход, смена пароля |
| Auth Alert | `BiHwX` | `jHHhe` | вход |
| Auth Brand | `FgoeA` | `R41bE` | авторизация |
| Login Form | `UbQCL` | `sCZjx` | вход |
| Password Form | `kd8WN` | `rMzOx` | смена пароля |
| Restore Block | `O2Qml` | `RkEjM` | восстановление сессии |
| Connection Error Block | `dWuHu` | `ogLln` | ошибка связи |
| Nav Rail | `tAY5B` | inline `IINg3` (на каждом экране) | Desktop, Tablet |
| Tab Bar | `VdvcF` | inline `CEpvB` | Mobile |
| Panel Header | `dYQp4` | inline `iShgp` (Chat Header) | Desktop, Tablet |
| Panel Header · Mobile | `M00qXt` | inline `GboTc` (Top Bar) | Mobile |

Состояние после группы 1 (1.1): фреймы «Компоненты» (`TQnaP`, `VKVbI`, `crdSZ`, `ghJgQ`, `wn9D5`) и `F6L43` удалены, локальные мастера на досках отсутствуют; все экземпляры на досках 01–06 ссылаются на мастера UI Kit (`t:<Node ID>` из таблицы). Инлайн-оболочка (Nav Rail, Tab Bar, Panel Header, Top Bar, Next Steps) заменена экземплярами там, где структура совпадает с мастером; остальные варианты (Next Steps с другим числом элементов, часть Top Bar, 4 `Chat Header`) оставлены инлайн.

`Task Card Body` (`j0YMMO`) не переносился: временный компонент удалён, см. раздел про переход «уведомление → задача».

### Статус переноса на экземпляры
- **Сделано:** мастера нарисованы в UI Kit и сохранены; `j0YMMO` удалён; переход «уведомление → задача» (`jIUZ2`, `raaoa`, `BZau2`) собран из карточки задачи доски 03 (`Details Body`).
- **Сделано во втором проходе:** экземпляры на досках 01–06 переведены на `t:<Node ID>`, фреймы «Компоненты» удалены. Осталось инлайн (вне списка 1.1): часть Next Steps с иным числом элементов, часть Top Bar (мобильные, 400x64) и 4 Chat Header; для них нет подходящего мастера. Контрольные экраны сверены хэшем развёрнутого дерева и одним скриншотом; у `WxAFh` хэш разошёлся (нормализация `fill_container(N)`), визуально совпадает.

## Кандидаты на удаление
Список для согласования с пользователем. Ничего не удалено. Фреймы Portal и презентаций не входят.

UI Kit «Дизайн-система» (`t:XyiTL`, фрейм `Решение 01 · Synergy UI Kit` в `design-kit.lib.pen`) перекрывает старые фреймы ниже: стили, токены и мастера теперь берутся из него и из «Решение 02 · Клиентские приложения (CC, MH)».

| Node ID | Фрейм | Причина |
|---|---|---|
| `DILPP` | Manager Helper (старый документ, 10 разделов) | Заменён досками «Единый дизайн · 01–06»: разные стили и свои компоненты, макеты экранов MH расходятся с принятыми |
| `kP4tc` | MH · 01 · Окно чата | Дубль доски 01 (`N5zJ7`, Tablet и Mobile) и 02 (`CC227`) |
| `EZhWY` | MH · 02 · Окно списка чатов | Дубль 01 и 02 (список чатов, пустые и ошибочные состояния) |
| `sTxUw` | MH · 03 · Окно входа | Дубль доски 06 (`o1X1US`) |
| `f5Nbi` | MH · 04 · Окно смены пароля | Дубль доски 06 |
| `rOuSv` | MH · 05 · Окно восстановления сессии | Дубль доски 06 (`Pd6db`) |
| `ntr1Z` | MH · 06 · Окно настроек | Отдельного макета настроек в новых досках нет; страница собирается из примитивов UI Kit. Оставить, пока не решено, нужен ли макет настроек |
| `uLRsP` | MH · 07 · Задачи | Дубль доски 03 (`RSL0e`) |
| `tGK2z` | MH · 08 · Создание задачи · редизайн | Дубль секции создания задачи доски 03 (`FPm0J`) |
| `RCYNX` | MH · 09 · Уведомления | Дубль доски 04 (`d34K1`) |
| `koxTO` | MH · 10 · Telegram | Дубль доски 05 (`QE24F`) |
| `tD0BP` | Control Center (старый документ, 5 разделов) | Заменён досками «Единый дизайн · 01–06» |
| `rRboJ` | CC · 01 · Главное окно | Дубль досок 01 и 02 (`N5zJ7`, `CC227`) |
| `zS5Js` | CC · 02 · Авторизация | Дубль доски 06 |
| `NbLWY` | CC · 03 · Задачи | Дубль доски 03 |
| `s43f7` | CC · 04 · Уведомления | Дубль доски 04 |
| `CEjNm` | CC · 05 · Telegram | Дубль доски 05 |
| `G27Xz`, `Q2eC5y` | Entity Header MH и CC | Заголовки старых документов, нужны только вместе с ними |
| `QT961`, `p9kkD`, `vJjOt`, `bA4VT`, `CNwJW`, `c8WHFT`, `kAf4d`, `O82dg`, `E0GD5a` | Разделители внутри `DILPP` | Уходят вместе с `DILPP` |
| `TQnaP`, `VKVbI`, `crdSZ`, `ghJgQ`, `wn9D5`, `F6L43` | Фреймы «Компоненты» на досках | Удалены в группе 1 (1.1); мастера в UI Kit |
| `ZqCio` (`HU7mY`, `J6jutl`, `JQPUf`) | Компоненты чата (черновик) | Дубль досок 01 и 02. Оставить `cBn7j` (состояния композера) и `W8ash3` (редактирование) как заделы, пока они не перенесены |

Вопрос пользователю: удалить фреймы из списка (кроме `ntr1Z`, `cBn7j`, `W8ash3`) после второго прохода переноса экземпляров?

## Отклонения от architecture.md
Нет. Страница настроек MH отдельного макета не имеет. Она собирается из примитивов UI Kit и панелей Telegram и сверяется по стилю с доской `QE24F`.

---

## Confirmation Checklist
- [x] Спроектированы все Pages из architecture.md (Desktop, Tablet, Mobile)
- [x] Мастер-компоненты переиспользованы; перенос в UI Kit — группа 1
- [x] Новые компоненты: перенос в UI Kit как мастеров согласован и выполняется группой 1 tasks.md
- [x] Layout проверен на каждом экране при отрисовке
- [x] Пользователь посмотрел экраны и подтвердил дизайн
- [x] Пользователь подтвердил переход к tasks.md («запускай создание tasks»)
