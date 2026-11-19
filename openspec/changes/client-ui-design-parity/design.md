## Context

Мотивация — в proposal.md, раздел Why. Требования — в `specs/`. Перечень расхождений с Node ID, путями в коде и статусами CC и MH — в отчёте аудита от 2026-11-20 (`~/.bb/thread-storage/thr_w53k3snape/gap-report.md`, вне репозитория). Структура пакета `@synergy/ui-kit` и решения D1–D18 взяты из `openspec/changes/unified-client-ui/design.md` и здесь не повторяются: пакет поставляется исходниками, компоненты презентационные, платформа и данные живут в контейнерах приложений, чат строится на примитивах assistant-ui.

Текущее состояние, которое определяет подход:
- **Голос.**
  - `TranscribeVoiceUseCase` (модуль `transcription`) принимает `VoiceClip` с длительностью от вызывающего. Форматы: `ogg | mp3 | wav`. Лимиты: 3 мин, 5 МБ, 30 с на провайдера.
  - Use case вызывает только бот Telegram, HTTP-эндпоинта нет.
  - Chromium (Electron CC и side panel MH) пишет через `MediaRecorder` только `audio/webm;codecs=opus`, часто без длительности в метаданных.
  - ffmpeg уже используется в `transcription/meeting/infrastructure/ffmpeg/meeting-audio-preparer.ts`.
  - Общего throttler нет; Redis-счётчик попыток есть только у входа (`auth/infrastructure/redis-login-attempt-store.ts`).
- **История чата.**
  - `StartAgentRunUseCase` при каждом запуске вызывает `appendUserMessage`.
  - `AgentController` берёт из `messages` только текст последнего сообщения пользователя.
  - Поэтому `reload()` в CC (`ChatThread.tsx`) и MH (`ThreadView.tsx`) после ошибки сохраняет вопрос второй раз. Баг подтверждён чтением кода: `onRetry` → `message.reload()` → `POST /agent` → `appendUserMessage`.
  - `chat_message` сортируется по `id`.
  - Контекст агента — LangGraph `PostgresSaver`, `thread_id` = id чата. `ChatThreadPort` умеет только `deleteThread`.
  - Сообщения системы пишутся в контекст через `AgentContextWriterPort`.
- **Клиент чата.**
  - `useAgUiRuntime` поддерживает `onEdit` (append с `parentId`, ветка) и `onReload`.
  - CUSTOM-события парсятся; `file-attached` уже обрабатывается.
  - Сообщения, отправленные в текущей сессии, имеют клиентские id; id из истории — серверные.
- **Быстрый подбор MH.** `QuickSearchForm` рендерится в `ThreadView` над композером. Видимость задаёт `form-visibility.ts`. Значения формы хранятся в локальном `useState` и сбрасываются при размонтировании.
- **Макеты.** Доска `DYxox` — кнопка (вариант A: Tablet `MpzNH`, Mobile `h2cqd`) и шторка. Кадры: пустая форма `B1Cic` / `DRfkj`, заполненная `zF7nu` / `NPaEx`, лимит `znHOi` / `FZkVJ`, «Курсы и ДПО» `kOTfw` / `RMJUu`, после отправки `OqKTZ` / `I5YIoq`. Голос — `cBn7j` (`iJP1F` запись, `kdkog` расшифровка). На макетах нет ни кнопки отправки расшифровки, ни признаков автоотправки: расшифровка попадает в поле. Редактирование — `W8ash3`, стартовое окно — `IY5Ex`.

## Goals / Non-Goals

**Goals:**
- Закрыть все расхождения из аудита, кроме вынесенных в proposal, в обоих клиентах через пакет. Отдельных реализаций в приложениях быть не должно.
- Голос и перезапуск ответа сделать на бэкенде как настоящие операции с контрактом и тестами, а не как клиентские обходы.
- Исправить дубль вопроса при «Повторить» тем же механизмом, что редактирование.

**Non-Goals:**
- Ветки сообщений (переключатель вариантов ответа). После правки старая ветка удаляется на сервере, `BranchPicker` не показывается.
- Сохранение результата вызова инструмента в истории, план вызовов («ожидает»).
- Серверный поиск по истории чатов.
- Номер задачи и ссылка на задачу.

## Decisions

### E1. Один change, четыре волны
Волны: макеты → бэкенд (голос ‖ перезапуск) и пакет (примитивы ‖ чат ‖ задачи ‖ оболочка) → контейнеры CC ‖ MH → интеграция и ревью. Кодовые группы пакета не ждут бэкенд: порты голоса и перезапуска тестируются на фейках. Delta `client-ui-kit` добавляет требования к capability, которую создаёт `unified-client-ui`, поэтому этот change архивируется после него.

### E2. Голос: `POST /transcriptions/voice` в модуле `transcription`
Новый `VoiceTranscriptionsController` (`transcription/interface/http/`) и use case `TranscribeUploadedVoiceUseCase`. Use case по шагам:
1. **Лимит частоты** — `VoiceRateLimiterPort.acquire(userId)`, см. E3.
2. **Нормализация** — `VoiceAudioNormalizerPort.normalize(buffer, mimeType, signal)`. Адаптер `FfmpegVoiceAudioNormalizer`:
   - ffprobe читает длительность по потоку, а не из метаданных; webm из MediaRecorder без длительности ffprobe считает декодированием;
   - если формат уже поддерживается провайдером (ogg/mp3/wav), запись не перекодируется, иначе перекодируется ffmpeg в `ogg/opus` (`-c:a libopus -b:a 32k -ac 1`);
   - путь к бинарникам берётся из той же конфигурации, что у `MeetingAudioPreparer`;
   - запись, которую ffprobe не прочитал, даёт `unsupported-format`.
3. **Расшифровка** — `VoiceClip.of({ audio, mimeType: 'audio/ogg', durationSec })` с серверной длительностью → существующий `TranscribeVoiceUseCase.execute(clip, signal)`. Проверку длительности use case уже делает сам, поэтому при длинной записи провайдер не вызывается.

Приём файла:
- `busboy` с `limits.fileSize = MAX_VOICE_SIZE_BYTES`, как `FilesController`. Превышение даёт 413 сразу, тело не дочитывается.
- Поле `audio`, любой `audio/*` или `video/webm`: Chromium иногда помечает webm как `video/webm`.
- `AbortController` отменяется по `req.on('close')`.

Ответы:

| Код | Тело | Когда |
|---|---|---|
| 200 | `{ kind: 'text', text }` / `{ kind: 'no-speech' }` | успех |
| 400 | `VOICE_AUDIO_REQUIRED` | нет поля `audio` |
| 413 | `VOICE_TOO_LARGE` / `VOICE_TOO_LONG` | больше 5 МБ / длиннее 3 мин |
| 415 | `VOICE_UNSUPPORTED_FORMAT` | не аудио или не декодируется |
| 429 | `VOICE_RATE_LIMITED`, заголовок `Retry-After` | лимит частоты |
| 503 | `VOICE_PROVIDER_UNAVAILABLE` | сбой или таймаут провайдера |

Доступ — глобальный `JwtAuthGuard` и `ClientAppGuard`, как у `/agent`. `ClientAppGuard` переезжает из `assistant/interface/http/` в `shared/http/client-app.guard.ts`, чтобы модуль `transcription` не импортировал модуль `assistant`.

Рассмотренные альтернативы:
- **Отдавать webm провайдеру как есть.** OpenRouter `input_audio` принимает только ogg/mp3/wav.
- **Перекодировать на клиенте.** В расширении нет ffmpeg, wasm-сборка весит десятки мегабайт.
- **Брать длительность с клиента.** Ей нельзя доверять, и в webm её часто нет.

### E3. Лимит частоты голоса
`VoiceRateLimiterPort` (домен `transcription`), адаптер `RedisVoiceRateLimiter`:
- фиксированное окно 60 с: `INCR` + `PEXPIRE` по ключу `voice-rate:<userId>`;
- предел в env `VOICE_TRANSCRIPTION_MAX_PER_MINUTE`, по умолчанию 20;
- если Redis недоступен, лимит не применяется (fail-open), в лог пишется ошибка — как у `LoginThrottler`.

Общий throttler (`@nestjs/throttler`) отклонён: ради одного маршрута он тянет глобальную конфигурацию. Порт `LoginAttemptStore` из `auth` отклонён: это нарушило бы границы модулей.

### E4. Голос на клиенте: порт в пакете, разрешения в приложениях
В пакете:
- `useVoiceInput(port)`:
  - `MediaRecorder` (`audio/webm;codecs=opus`);
  - таймер и автостоп на 3:00;
  - уровень сигнала для волны через `AnalyserNode`;
  - отмена запроса при размонтировании.
- `VoiceTranscriptionPort`:
  ```
  type VoiceTranscriptionPort = {
    transcribe(audio: Blob, opts: { signal: AbortSignal }): Promise<VoiceTranscript>
    ensureMicrophoneAccess?(): Promise<'granted' | 'denied' | 'prompt-elsewhere'>
  }
  type VoiceTranscript = { kind: 'text'; text: string } | { kind: 'no-speech' }
  ```
  Ошибки порта — `VoiceError` с кодом из таблицы E2 или `microphone-denied`.
- `Composer` получает состояния `idle | recording | transcribing | error` и вставляет текст через `aui.composer().setText(prev ? prev + ' ' + text : text)`. Автоотправки нет: на макете `cBn7j` её нет, а расшифровку стоит проверить перед отправкой.

В приложениях:
- **CC.** В main-процессе `session.defaultSession.setPermissionRequestHandler` и `setPermissionCheckHandler` разрешают `media` (только аудио) для окна приложения и запрещают остальное. Транспорт — multipart через `cc-api://backend/transcriptions/voice`: прокси main-процесса уже передаёт бинарные тела, так грузятся файлы.
- **MH.** Side panel не показывает системный запрос микрофона. Поэтому `ensureMicrophoneAccess` проверяет `navigator.permissions.query({name:'microphone'})`. При `prompt` порт открывает вкладку `mic-permission.html` — страницу расширения, где вызывается `getUserMedia` и после разрешения показывается «Можно вернуться в панель». Затем порт возвращает `prompt-elsewhere`, и композер показывает подсказку. Разрешение выдаётся на origin расширения, поэтому запрос нужен один раз. Транспорт — `authFetch` с `FormData`.

### E5. Перезапуск ответа: `forwardedProps.replaceFromMessageId` в `POST /agent`
Отдельный эндпоинт отклонён: он дублирует SSE-конвейер, а assistant-ui отправляет и правку, и повтор через тот же `HttpAgent`.

Сервер, в `StartAgentRunUseCase.execute`, когда передан `replaceFromMessageId`:
1. Проверка ввода и чата, как сейчас.
2. `registry.startAfterSystemMessages` → `null` ⇒ `RunConflictError` (409).
3. `sessions.findRewindPoint(threadId, ownerId, messageId)` → `RewindPoint { messageId, attachments, checkpointId | null }`:
   - сообщение агента, чужое или неизвестное ⇒ `MessageNotFoundError` (404);
   - `rewindable = false` ⇒ `MessageNotRewindableError` (422 `MESSAGE_NOT_EDITABLE`).
4. Одна транзакция `sessions.replaceFrom(threadId, ownerId, messageId, { text, attachments, checkpointId })`: `DELETE FROM chat_message WHERE session_id = $1 AND id >= $2` (связи вложений удаляются каскадом) и вставка нового сообщения пользователя. Время активности обновляется.
5. Запуск агента с `AgentRunScope.fromCheckpointId = checkpointId`. Если `checkpointId = null`, контекст до этого сообщения был пуст, и перед запуском вызывается `threads.deleteThread(threadId)`.

Если шаги 3–4 упали, реестр освобождается, и ничего не меняется. Вложения берутся из исходного сообщения, `fileIds` запроса игнорируются. Название не меняется.

### E6. Откат контекста LangGraph — форк от сохранённого чекпоинта
Каждое новое сообщение пользователя сохраняется с точкой отката: id последнего чекпоинта треда на момент перед запуском (`ChatThreadPort.latestCheckpointId(threadId)`) и `rewindable = true`. Миграция добавляет в `chat_message` колонки `agent_checkpoint_id TEXT NULL` и `rewindable BOOLEAN NOT NULL DEFAULT false`. Старые сообщения получают `false`.

При перезапуске агент вызывается с `configurable: { thread_id, checkpoint_id }`: LangGraph продолжает с этого чекпоинта и пишет новую ветку. Старые чекпоинты не меняются. `getTuple` без `checkpoint_id` возвращает самый новый чекпоинт (сортировка по `checkpoint_id`, uuid6 упорядочен по времени), поэтому дальнейшие запуски и запись сообщений системы идут от новой ветки. Брошенные ветки удаляются вместе с тредом при удалении чата.

Рассмотренные альтернативы:
- **`updateState` + `RemoveMessage`.** Зависит от id сообщений в состоянии оркестратора и подграфов и от сообщений системы, записанных `AgentContextWriter`; сопоставлять N-й вопрос таблицы с N-м `HumanMessage` хрупко.
- **Переписать контекст из таблицы сообщений.** В таблице нет вызовов инструментов и служебных блоков, которые видел агент.

Первая задача бэкенд-группы — спайк на реальном `PostgresSaver`: форк, следующий обычный запуск, запись сообщения системы после форка.

### E7. Id сохранённого вопроса и признак `editable`
- Сразу после `appendUserMessage` / `replaceFrom` наблюдатель получает доменное событие `user-message-saved { messageId }`. `AgUiEventMapper` отдаёт его как CUSTOM `user-message-saved` до `RUN_STARTED` — клиенты, которые его не знают, его игнорируют.
- `GET /threads/:id/messages` отдаёт у сообщений пользователя `editable: boolean` (= `rewindable`).
- В клиенте `useServerMessageIds` (пакет) хранит `Map<localId, serverId>` из CUSTOM-события и `Set` нередактируемых id из истории. «Изменить» показывается только для сообщения с известным серверным id и `editable`.

### E8. Правка и повтор на клиенте
Контейнер ставит «точку перезапуска» перед вызовом runtime, а обёртка агента `withReplaceFrom(agent, takePending)` (пакет, рядом с `withFileIds`) добавляет `forwardedProps.replaceFromMessageId` к ближайшему запуску:
- `EditComposer` → `onEdit` → точка = серверный id редактируемого сообщения;
- «Повторить» после ошибки и после остановки → `reload` → точка = серверный id последнего вопроса. Если id неизвестен (вопрос не дошёл до сервера), запуск идёт без точки — дубля нет, потому что сервер вопрос не сохранил.

После завершения перезапуска контейнер перечитывает историю (`thread.import`), и лента синхронизируется с сервером без старой ветки. `BranchPicker` не подключается. 409 показывается в `RunNotice` текстом «Агент ещё отвечает — дождитесь ответа или остановите его».

### E9. Длительность вызова инструмента
- **Во время запуска** длительность считает клиент: разница между `TOOL_CALL_START` и `TOOL_CALL_RESULT`.
- **В истории** `collect-tool-calls.ts` фиксирует время старта и конца каждого вызова, и `ToolCallTrace` получает необязательное `durationMs`. Трассировка хранится в JSON, поэтому миграция не нужна. Маппер истории отдаёт `durationMs`.
- **Формат** «0,4 с» (`Intl.NumberFormat('ru', { maximumFractionDigits: 1 })`).

### E10. Быстрый подбор: кнопка-слот композера и шторка
- **Композер.** `Composer` получает слот `tools` слева от поля, рядом с «+». MH кладёт туда `QuickSearchButton` — пилюлю «Подбор» с фоном `brand-red-soft` и текстом `brand-red` по `MpzNH` / `h2cqd`. CC слот не использует.
- **Шторка.** `QuickSearchSheet` (MH) — `Sheet` пакета: `side="bottom"` в мобильном режиме, в колонке чата — в планшетном.
  - Внутри `QuickSearchForm`, переписанная на управляемые значения `value / onChange`.
  - Превью `buildQuickSearchQuery` / `buildQuickSearchTitle` пересчитывается на лету.
  - Направления выбираются во вложенном списке с синонимами, счётчиком и блокировкой после трёх.
- **Состояние формы.** `useQuickSearchDrafts` хранит `Map<threadId, QuickSearchForm>` в памяти контейнера `ChatPane` и живёт, пока открыта панель. `form-visibility.ts` удаляется.
- **Отправка.** После отправки шторка закрывается, запрос уходит через существующий `onQuickSearch(query, title)`.
- **Метки «Быстрый подбор» над отправленным сообщением нет** (решение пользователя): запрос из шторки — обычное сообщение пользователя, бэкенд не меняется. Метку из кадров `OqKTZ` / `I5YIoq` убирает группа 1 (design).
- **Тексты шторки** (решение пользователя): подписи «необязательно» у необязательных полей, подсказка лимита «3 из 3» и «Можно выбрать до 3 направлений. Снимите одно, чтобы выбрать другое.», кнопка «Отправить в чат».

### E11. Стартовое окно
`ThreadWelcome` в пакете (`chat/ThreadWelcome.tsx`) заменяет `Welcome` в `Thread.tsx` и `empty` MH. Набор карточек `WELCOME_SUGGESTIONS` — константа пакета: заголовок, пример, запрос для поля. Карточек четыре на desktop и три на tablet / mobile, как на макетах. Клик вызывает `aui.composer().setText(prompt)` только при пустом поле и ставит фокус. Отправки нет: примеры на карточках — обрывки («МВА «Маркетинг», очно, Москва»), их нужно дописать. В CC `NoChat` («Выберите чат») удаляется: без выбранного чата показывается `ThreadWelcome`, а первая отправка создаёт чат, как кнопка «Новый чат».

### E12. Соединение с сервером в чате
`useServerReachability` (пакет, `chat/`) переходит в `offline` при сетевой ошибке (`TypeError: Failed to fetch`, `net::ERR_*` из cc-api) в запуске или запросе истории. «Повторить» вызывает `probe()` приложения: `GET /health` — у бэкенда есть `shared/health`. `Thread` получает `connection: 'online' | 'offline'`. При `offline` он показывает `ConnectionBanner` (`wifi-off`, «Сервер недоступен», «Повторить»), а `Composer` переходит в `disabled` с плейсхолдером «Нет связи с сервером». Текст поля сохраняется: assistant-ui хранит черновик в runtime.

### E13. Поиск по чату и меню в шапке
- **`ChatSearchBar`** в пакете. Поиск идёт по тексту частей загруженных сообщений (`useAuiState(s => s.thread.messages)`). Подсветка — `<mark>` в `MarkdownText` через плагин rehype по текущему запросу; переход — `scrollIntoView` к сообщению с текущим совпадением.
- **`ChatHeaderMenu`** — «Переименовать», «Удалить», те же колбэки, что у `ChatListItem`.
- Поведение не нарисовано, поэтому выбран минимально разумный вариант (см. «Решения по умолчанию»).

### E14. Меню строки и тосты
- **`ChatListItem`.** Вместо `Pencil` / `Trash2` — кнопка `ellipsis` с `Menu` («Переименовать», «Удалить»). Красная строка ошибки под строкой списка удаляется.
- **`Toast` и `ToastProvider`.** Новый примитив пакета на `radix-ui` Toast, `aria-live` (`polite` для успеха, `assertive` для ошибок). Тосты переименования и удаления чата и тост «Задача удалена» идут через него. `NotificationToast` остаётся отдельным: у него своя логика очереди и переходов.

### E15. Примитивы и макеты
- **`Button`** — радиус `rounded-lg` (16) у `primary` / `secondary` / `ghost`. `icon-round` остаётся круглой.
- **`Menu` и `ProfileMenu`** — радиус 20. В `tokens.css` такого радиуса нет (8, 12, 16, 24, 32), поэтому группа design добавляет в UI Kit переменную `r-menu` = 20, а пакет — токен `--radius-menu: 20px`; произвольное `rounded-[20px]` не используется.
- **`Input`** не меняется: эталон — серое поле с радиусом 24. Мастер `Field / Master` (`t:h9QWY`) правится в UI Kit под код.
- **`Sheet`** получает `grabber` (по умолчанию в `side="bottom"`) и `title?: string`: без заголовка строка с «X» не рендерится, имя диалога задаётся через `aria-label`. Свайп вниз закрывает шторку.

### E16. Задачи
- **`DeadlinePicker`.** Новый компонент пакета: быстрые даты, `Calendar` (свой, на `Intl` и сетке 7×6, без новой зависимости), поле времени, «Без срока», «Готово · …». Заменяет `datetime-local` в `TaskFormFields` и `TaskDetails`.
- **`TaskList`.** Группы по сроку (`groupByDeadline` в `tasks/deadline.ts`) при `layout != desktop` и сортировке по дедлайну. Ещё: «Показать ещё» без счётчика, `TaskSearchEmpty` с «Сбросить фильтры».
- **Мобильный режим.** `MobileSearchBar` для мобильного поиска. `TaskDeleteConfirm`: диалог на desktop / tablet, шторка с захватом на mobile.
- **`UserPicker`.** Подпись «Найдено N». В мобильном режиме, когда страница результатов заполнена, — «Показаны первые N · уточните поиск» без общего числа: API не отдаёт total, а его добавление не стоит отдельной бэкенд-задачи.
- **MH.**
  - планшет: `TaskCreateDialog` по центру и «Закрыть» в деталях;
  - мобильный: `TaskQuickCreateSheet` с чипами и вложенными шторками `AssigneeSheet` и `DeadlineSheet`, у которых есть «Назад».
- **Мелочи:** подвал «Изменена…», иконка удаления в верхней панели на mobile, тексты ошибок и пустого списка, «Загрузка…» в капсуле CC, Ctrl+Enter.

### E17. Уведомления
- **`NotificationsList`** получает `connection: 'online' | 'reconnecting'` и показывает баннер.
- **Источник состояния соединения:**
  - CC — состояние сокета main-процесса по IPC `notifications:connection`;
  - MH — `connectionState` из `background/notifications/panel-port-hub.ts`, передаётся в порт панели.
- **Иконки типов.** Общая функция `notificationIcon(type)` в пакете: `list-checks`, `alarm-clock`, `audio-lines`, `file-check`, `circle-alert`, иначе `bell`. Её используют оба приложения.
- **MH:**
  - группировка через тот же `groupOf`, что в CC; функция переезжает в пакет;
  - цель `chat` в `App.tsx` и действие «Открыть чат» в `NotificationToast`;
  - мобильная шапка списка через `MobileTopBar`.

### E18. Telegram и авторизация
- **QR-код.** `TelegramConnectPanel` строит QR из `link` библиотекой `qrcode` (SVG, без сети, MIT). Рядом — чип ссылки с `navigator.clipboard.writeText`.
- **«Бот не настроен».** Панель `TelegramNotConfiguredPanel` переезжает в пакет, копии в CC и MH удаляются.
- **Авторизация:**
  - `AuthAlert` получает `title` + `hint`;
  - `RateLimitBlock` с отсчётом по `retryAfterSec`, таймер в компоненте;
  - `PasswordChangedScreen` показывается после добровольной смены в `ChangePasswordDialog`.

### E19. Технические хвосты
`manager-helper/src/sidepanel/ChatTitleBar.tsx` и `ChatTitleBar.test.tsx` удаляются: grep не находит импортов вне этих файлов. Мелкие иконки (`plus` вместо `Paperclip`, `square-pen`, `arrow-up-right` в подсказках, `loader-circle` в индикаторе, `trash-2` в подтверждении, `message-square-dashed` в пустом списке, `circle-alert` + текст ошибки списка) правятся в соответствующих компонентах пакета.

## Risks / Trade-offs

- **[Риск] Форк чекпоинта ведёт себя не так, как ожидается** (подграфы, `checkpoint_ns`, запись сообщений системы после форка). → Спайк первой задачей группы перезапуска на реальном Postgres. Запасной вариант — `updateState` с `RemoveMessage` для главного графа; тогда меняется только адаптер `ChatThreadPort`.
- **[Компромисс] Сообщения системы после точки правки удаляются** (например, «расшифровка готова»). → Так история и контекст агента остаются согласованными. Документ расшифровки остаётся в файлах, уведомление о нём уже было.
- **[Компромисс] Старые сообщения нельзя изменить** (нет точки отката). → Сервер отдаёт `editable: false`, «Изменить» у них не показывается, «Повторить» для них работает как прежде (с дублем) — только для чатов, начатых до выката.
- **[Риск] Side panel MH не получает доступ к микрофону.** → Разовая страница `mic-permission.html`. Проверка в живом Chrome — критерий приёмки группы MH.
- **[Риск] ffmpeg недоступен на сервере.** → Он уже нужен расшифровке встреч. Проверка бинарника — в `onModuleInit` с понятной ошибкой в логе, а эндпоинт отвечает 503.
- **[Риск] Нагрузка от перекодирования.** → Лимит 5 МБ, 3 мин, лимит частоты; ffmpeg запускается с таймаутом и `-threads 1`.
- **[Риск] Объём — около 60 задач.** → Волны независимы, каждая группа — отдельный коммит; группы пакета не ждут бэкенд.

## Migration Plan

1. Архивировать `unified-client-ui` (его delta создаёт `client-ui-kit`), затем начинать этот change.
2. Макеты: мастер Field, удаления, дорисовки (ошибки голоса, меню «…», поиск в чате).
3. Бэкенд: миграция `chat_message` (колонки с умолчанием, без блокировки таблицы), голос, перезапуск. Новые поля и события обратно совместимы: старые клиенты их игнорируют.
4. Пакет, затем контейнеры CC и MH.
5. MH: в `manifest.config.ts` новых разрешений нет. Страница `mic-permission.html` добавляется в сборку.

Откат: каждая группа — отдельный коммит. Колонки миграции можно оставить при откате кода: умолчание `false` безопасно.

## Решения по умолчанию (2026-11-20, требуют подтверждения пользователем)

Open Questions закрыты рекомендуемыми решениями по сообщению координатора о том, что пользователь заранее разрешил их принять. Сам пользователь их в этой сессии не подтверждал: до запуска реализации их нужно показать ему.
1. **Тексты шторки быстрого подбора** — приняты: подписи «необязательно», подсказка о лимите «3 из 3» («Можно выбрать до 3 направлений. Снимите одно, чтобы выбрать другое.»), кнопка «Отправить в чат».
2. **Метка «Быстрый подбор»** над отправленным сообщением — **не делается**, чтобы не трогать бэкенд. Из макетов её убирает группа 1 (design).
3. **Поиск в шапке чата** — минимальное поведение из E13: строка поиска, подсветка, «N из M», переходы Enter / Shift+Enter, только по загруженным сообщениям текущего чата.
4. **Меню «…»** в шапке чата и у строки списка — «Переименовать» и «Удалить».
5. **Карточки стартового окна** — запрос = заголовок + пример (например, «Цены на программу: МВА «Маркетинг», очно, Москва»), текст подставляется в пустое поле без отправки.
6. **Лимит голоса** — 20 запросов в минуту на пользователя (`VOICE_TRANSCRIPTION_MAX_PER_MINUTE=20`).

## Разбивка на группы

Итоговая разбивка — в tasks.md: 14 групп, волны по зависимостям указаны в метаданных групп.
