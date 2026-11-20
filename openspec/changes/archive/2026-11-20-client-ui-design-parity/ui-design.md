# UI Design: client-ui-design-parity

Экраны уже нарисованы на досках «Единый дизайн · 01–07», новых экранов этот артефакт не рисует. Здесь страницы и компоненты из architecture.md сопоставлены с существующими Node ID: они взяты из аудита «макет против кода» от 2026-11-20 (`~/.bb/thread-storage/thr_w53k3snape/gap-report.md`) и из доски `DYxox`. Где макет нужно дорисовать или исправить, стоит пометка «группа 1 (design)».

## Источник дизайна
- **.pen файл:** `design/synergy-design.pen`.
- **Доски:**
  - `ZqCio` — компоненты чата;
  - `N5zJ7` — 01 · Чат;
  - `CC227` — 02 · Чат — состояния;
  - `RSL0e` — 03 · Задачи;
  - `d34K1` — 04 · Уведомления;
  - `QE24F` — 05 · Профиль и Telegram;
  - `o1X1US` — 06 · Авторизация;
  - `DYxox` — 07 · Быстрый подбор (MH).
- **UI Kit:** `design/design-kit.lib.pen`, компоненты с префиксом `t:`. Нужные здесь мастера:
  - кнопки и поля: Button `t:CnrxI`, Field `t:h9QWY`, Auth Field `t:FKQoS`, Auth Alert `t:BiHwX`;
  - чат: Composer `t:pIv9n`, Edit Composer `t:Qi8IW`, Tool Group `t:XGryy`, Tool Call Row `t:bmE57`, Tool Call Details `t:OAHBx`, Message Notice `t:K2JcP`, Next Steps `t:NiMwn`;
  - список чатов: Chat List Item `t:DkqIz`, Confirm Delete `t:p61fs`;
  - задачи: Task Row · Compact `t:McFWZ`, Task Empty State `t:c1QCX`;
  - уведомления: Notification Item `t:QKIL8`, Notification Toast `t:kRwI5`;
  - профиль и Telegram: Profile Menu `t:bkkKv`, TG Panel · Ожидание `t:bGxJG`.
- **Режимы:** Desktop — CC, Tablet — MH шириной от 640 px, Mobile — MH уже 640 px.

---

## Экраны
| Page (из architecture.md) | Имя фрейма в .pen | Node ID | Breakpoints | Переиспользованные компоненты | Статус |
|---|---|---|---|---|---|
| ChatsScreen (CC) | 01 · Чат · Desktop; Desktop со скрытым списком | `VHpuS`, `b4IMkD` (доска `N5zJ7`); шапка `n0xJs` (поиск `MBHzU`, меню `dMCgn`); поле поиска «Поиск (⌘K)» `BTWVX`; «Новый чат» `un8o4` | Desktop | Composer, Tool Group, Chat List Item | ready |
| ChatsScreen (MH) · tablet / mobile | 01 · Чат · Tablet; Mobile (чат, список) | `WxAFh`; `Elt3T`, `hTZ3b` | Tablet, Mobile | Composer, Chat List Item, Panel Header · Mobile | ready |
| Стартовое окно (оба) | Секция 1 · Новый чат — ThreadWelcome | `IY5Ex`: Desktop `RECQu` (карточки `T2USTi`: `MoF5g`, `U6Ovf`, `KaPwn`, `m6TUBe`), Tablet `XNgpW`, Mobile `WqKs7`; шапка нового чата `n3IJCx` / `VjCYU`; меню `YRqp3` | все | Composer | ready |
| Сообщение пользователя: «Копировать» / «Изменить» | ActionBar под сообщением | `CiIUc` → `tEqQh` / `vW6li` (Копировать), `l3iY4` (Изменить); Mobile `Elt3T` | все | — | ready |
| Редактирование (EditComposer) | Секция 3 · Редактирование | `W8ash3`: Desktop `ICYYe`, Tablet `fEPKG`, Mobile `mPEvR`; ответ «будет заменён» `PFJkB`; мастер `t:Qi8IW` | все | Edit Composer | ready |
| Голосовой ввод (Composer) | Composer States | `cBn7j`: пустой `S1rtF`, запись `iJP1F` (`KcO4q`, `R7I47b`), расшифровка `kdkog` (`JuIPQ`); микрофон `Gt1Xk` → `CTxJe`; «+» `WreQ3` | все | Composer | ready; ошибки голоса — секция `v0WDO` (доска `CC227`) |
| Группа инструментов | Tool Group во время работы, ошибка, история | `y2PJn` → `eiCIQ`; `JQPUf` → `f6Cju`, `ChtUA`; `G9GQ6f` → `IMMUP`; длительность `elTf3`, `Y4dmd`; ошибка `EVT6N` | все | Tool Group, Tool Call Row | ready (состояние «ожидает» `circle-dashed` в `y2PJn` не реализуется) |
| Быстрый подбор (MH) | 07 · Быстрый подбор | `DYxox`: кнопка, вариант A — Tablet `MpzNH`, Mobile `h2cqd`; пустая форма `B1Cic` / `DRfkj`; заполненная `zF7nu` / `NPaEx`; лимит направлений `znHOi` / `FZkVJ`; «Курсы и ДПО» `kOTfw` / `RMJUu`; после отправки `OqKTZ` / `I5YIoq` | Tablet, Mobile | Composer, Sheet | ready; метка «Быстрый подбор» над сообщением и вариант B удалены (группа 1) |
| TasksScreen (CC) | 03 · Задачи · Desktop | `qryQB` (секция `wTDH3`): подвал «Изменена…» `I6r3X`; номер `#1284` и «Копировать ссылку» убраны из `G710E` (группа 1) | Desktop | Task Row | ready |
| TasksApp (MH) · tablet / mobile | 03 · Задачи · Tablet / Mobile | `Nk6nR`, `YDMzw`, `pXHcl`; группы по сроку T `LH6TB`, `d3Seh`, `smmmR`, `jCijl`, M `o9BBX`; «Показать ещё» `s6iDNw`; «Закрыть» `Vymkn`; удаление в верхней панели `BeUHh`; номер и «Копировать ссылку» убраны из `LUnkr`, `j09HC` (Mobile: «изменена …»), кнопки `llz0q`, `SIQpe`, `m7QLpo` удалены (группа 1) | Tablet, Mobile | Task Row · Compact | ready |
| Создание задачи и дедлайн | Секция `FPm0J` | Ctrl+Enter D `bQEw8`, T `gaFeq`; дедлайн T `wsVSM`, M `U2q8r` (`WtwHU`, `axTVg`); выбор пользователя D `oPK56`, M `qvMfS`, `r5jfj4`; диалог на планшете `m8ddx`; быстрое создание M `ZzHmH` (захват `aLr5O`); вложенные шторки `AxP1M`, `U2q8r` | все | Field, Button, Sheet | ready |
| Удаление задачи | Секция `YjjPE` | T `RVl1S`, M `AKFlk` (захват `sS9me`) | Tablet, Mobile | Button | ready |
| NotificationsOverlay (MH), уведомления CC | 04 · Уведомления | группы `SJ0NJ` → `JVaZq`, `ySJGK`, `kceWr`; иконки `t:zaUw1`, `t:U8o8w`, `t:K1knz`, `t:mfDBu`, `t:QKRZe`; мобильный список `U5dtI`; тост «Открыть чат» `DNt8I` → `c03Rm` | все | Notification Item, Notification Toast | ready |
| Telegram (CC, MH) | 05 · Профиль и Telegram | QR `b8m3B` → `t:se4na` (`t:d3TffG`); чип ссылки `t:R31sI`; «бот не настроен» `FKTcZ` → `mMT1Q`; шторка профиля M `TLMEl` → `jEt65` (захват `Jn2im`); меню `Fcbg2` | все | TG Panel · Ожидание, Profile Menu | ready |
| AuthGate (CC, MH) | 06 · Авторизация | 429 `J3k93c` → `uTccU`; двухстрочный алерт `vS9mP`, `FE3Et`, `NGAZY`; «Пароль изменён» `k0ym4w` → M `KxBWe`; временный пароль `W46ZRR` → `sLuob`; смена пароля в шторке `kW2AT` → M `xAW7L` (`k518D`) | все | Auth Field, Auth Alert | ready |
| Main (CC), MicPermissionPage (MH) | макета нет | — | — | — | платформенные экраны без макета |

## Ключевые состояния экранов
| Экран | Состояние | Как показано | Node ID |
|---|---|---|---|
| Чат | Сервер недоступен: баннер, поле заблокировано | секция | `pUB2g`: D `cCOWQ`, T `c4IDcM`, M `i2H1sh` |
| Чат | Ответ остановлен + «Повторить» | секция | `G9GQ6f` → D `obt14` (`l7TqqO`, `wvaFq`), T `ak0ha` |
| Чат | Индикатор «Агент отвечает…» со спиннером | строка | `y2PJn` → `eiCIQ` |
| Чат | Ошибки голоса: нет доступа к микрофону, речь не распознана, слишком длинная запись, сервис недоступен, слишком много запросов | секция `v0WDO` на доске `CC227`: D `U78VrM`, T `M9S7eE`, M `T8Kok` (по пять состояний; мастер композера рядом с `cBn7j` без изменений) | `J1XfB`, `og4yp`, `jg9EL`, `SwDh3`, `fVpNv` (Desktop) |
| Чат | Поиск в шапке: строка, «N из M», подсветка | секция `jScoT` на доске `CC227` (Desktop и Tablet; на Mobile кнопки поиска нет): найдено «1 из 2» D `jcA4K`, T `tAyPe`; «Нет совпадений» D `D5knpb`, T `aPZ48` | `jcA4K`, `D5knpb`, `tAyPe`, `aPZ48` |
| Чат | Меню «…» в шапке и у строки списка | секция `p0TFf9` на доске `CC227`: меню в шапке D `ass4u`, T `du6xO`; меню у строки D `hy1rl`, T `X95Zb`, M `g54bsT`; состав «Переименовать», «Удалить» | `WVAc0`, `L7FgP`, `tUMfJ`, `jgQNn`, `Nsf9O` (меню), `lAjtD` |
| Список чатов | Пусто, ошибка загрузки | секция | `D4V94`: D `ur8iE`, M `v3FfzU`, `BiRJ4` |
| Список чатов | Подтверждение удаления с `trash-2` | секция | `ddf2k` → `Wz6ru` |
| Список чатов | Тосты ошибок переименования и удаления | секции | `AdObY` (`n2HLuP`, `nrkEh`, `J6Qtd`), `w87KAw` (`a8Zqc`, `nokRC`, `yuhOA`) |
| Задачи | «Ничего не найдено» + «Сбросить фильтры», мобильный поиск | секция | `c0aEh5` → M `f7x00O`, `xXfNH` |
| Задачи | Тост «Задача удалена» | секция | `c0aEh5` → D `miE5X` |
| Задачи | Пусто (иконка `list-checks`), «Загрузка…» в капсуле | секция | `c0aEh5` → T `CoBEv`, D `ucPQ3` |
| Задачи | Ошибка загрузки списка | секция | `dp4Xk` → T `gnLLN` |
| Задачи | «Статусы не загрузились» | не реализуется; состояние удалено из макета (группа 1) | — |
| Уведомления | Нет соединения · переподключаемся | секция | `eKukg` → `snuT4` (`FlaJH`); M `f9l1v` (`S1b0M`), `l0Feq`, `ELc5C`, `jolqk` |
| Уведомления | Ошибка загрузки (`cloud-off`) | секция | `eKukg` → `t5Kf4U` |

## Новые компоненты UI Kit
Новых мастеров в макетах этот change не создаёт. Компоненты пакета `Toast`, `Calendar` / `DeadlinePicker`, `ChatSearchBar`, `ConnectionBanner` и `VoiceRecorderBar` повторяют уже нарисованные экраны: `AdObY`, `wsVSM`, `pUB2g`, `iJP1F`. Правки UI Kit в группе 1 (design):

| Компонент | Node ID | Что меняется |
|---|---|---|
| Field / Master | `t:h9QWY` | Привести к коду: фон `surface-alt`, без обводки, радиус 24, как Auth Field `t:FKQoS` |
| Переменная радиуса меню | — | Добавить `r-menu` = 20: у Profile Menu `t:bkkKv` радиус 20, токена в коде нет |

## Отклонения от architecture.md
Нет. Макетов нет у платформенных экранов `mic-permission.html` (MH) и разрешений main-процесса (CC). Это одноразовая служебная страница и код без UI, их собирают из примитивов UI Kit.

---

## Confirmation Checklist
- [x] Все Pages из architecture.md сопоставлены с экранами (Desktop, Tablet, Mobile)
- [x] Использованы мастера UI Kit; новых мастеров нет, правки Field и `r-menu` — в группе 1
- [x] Недостающие макеты (ошибки голоса, поиск в шапке, меню «…») и удаления («#1284», «Копировать ссылку», `ntZI7`, метка «Быстрый подбор», вариант B) отнесены к группе 1 (design)
- [x] Layout существующих экранов проверен при их отрисовке
- [x] Пользователь посмотрел экраны и подтвердил дизайн
- [x] Пользователь подтвердил переход к tasks.md

> Отмечено координатором 2026-11-20 по прямому указанию пользователя в чате: «в любом случае принимай все изменения и пиши tasks как закончит агент и после запускай workflow». Пользователь заранее разрешил принять решения по умолчанию; архитектуру и доску 07 построчно он не просматривал — показать ему в итоге реализации.
