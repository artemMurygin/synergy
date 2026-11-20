# ui-kit (`@synergy/ui-kit`)

Общий UI Kit клиентов (control-center, manager-helper). Поставка исходниками: без сборки, `exports` указывают на `src`. Эталон вида — `design/design-kit.lib.pen`.

## Структура

| Путь | Что |
|---|---|
| `styles/tokens.css` | токены в `@theme`, имена Pencil без `t:` (`--color-*`, `--radius-*`, `--font-*`, `--shadow-*`) |
| `styles/fonts.css` | четыре шрифта локально (fontsource variable), без сети |
| `styles/base.css` | `color-scheme: light`, `body { font-family }` вне слоёв, `.markdown` |
| `styles/index.css` | точка входа `@synergy/ui-kit/styles.css` |
| `src/index.ts` | публичный API |
| `src/icons.ts` | иконки (lucide: размер 18, strokeWidth 2, aria-hidden); `@synergy/ui-kit/icons` |
| `src/lib/cn.ts` | `cn` = clsx + tailwind-merge |
| `src/layout/` | `LayoutModeProvider`/`useLayoutMode`, `useViewportWidth`, `chatPaneVisibility`, `tasksPaneVisibility` |

Глубокие импорты `@synergy/ui-kit/src/...` запрещены.

## Подключение в приложении

В CSS приложения: `@import 'tailwindcss'; @import '@synergy/ui-kit/styles.css'; @source "<rel>/ui-kit/src";` (путь `@source` — относительный до `ui-kit/src`; CC: `'../../../../ui-kit/src'` из `renderer/src/index.css`).

## Правила

- Только светлая тема: нет `.dark` и `prefers-color-scheme`.
- Новые токены сначала появляются в `design-kit.lib.pen`, затем в `tokens.css` и тесте-снимке.

## Токены «старое -> новое»

| shadcn (CC) | UI Kit |
|---|---|
| `bg-background`, `bg-card` | `bg-surface` |
| `text-foreground`, `text-card-foreground`, `text-secondary-foreground` | `text-ink` |
| `bg-secondary`, `bg-muted` | `bg-surface-alt` |
| `text-muted-foreground` | `text-ink-60` |
| `bg-primary` / `text-primary` / `text-primary-foreground` | `bg-brand-red` / `text-brand-red` / `text-surface` |
| `bg-accent` / `hover:text-accent-foreground` | `bg-brand-red-soft` / `hover:text-brand-red-hover` |
| `bg-destructive`, `text-destructive`, `border-destructive` | `*-brand-red-hover` |
| `border-input` | `border-border` |
| `ring-ring` | `ring-brand-red/40` |
| `dark:*` | нет, только светлая тема |

## Токены «старое -> новое» (MH)

| MH (старое) | UI Kit |
|---|---|
| локальные `--mh-*` / hex из `shared/styles.css` | токены `--color-*` по имени Pencil (`ink`, `ink-60`, `surface`, `surface-alt`, `border`, `brand-red`) |
| `PrimaryButton` | `Button variant="primary"` |
| локальные `PasswordField`, `Switch`, `InlineConfirm` | одноимённые примитивы пакета |
| `sidepanel/icons.tsx`, `options/telegram/icons.tsx` | `@synergy/ui-kit/icons` |

## Примитивы (дополнения)

- `Sheet` (`side="bottom"`): захват 40×4 по умолчанию (`grabber={false}` скрывает), свайп вниз ≥ 80px закрывает; без `title` нет строки заголовка с «X», имя диалога — `aria-label`.
- `Button` (`primary`/`secondary`/`ghost`): радиус 16 (`rounded-lg`); `icon-round` круглая.
- `Menu`/`ProfileMenu`: радиус через токен `--radius-menu: 20px` (`rounded-menu`).
- `Toast`: `ToastProvider` (один раз в корне) + `useToast()` -> `show({tone, title, description?, action?, persistent?})`, `dismiss(id)`; успех скрывается сам, ошибка с `persistent` остаётся до закрытия; `aria-live` polite/assertive; не больше 3 одновременно.
- `Calendar` (`value`, `onChange`, `today?`): Intl ru, неделя с понедельника, сетка 7×6; стрелки, Home/End, PageUp/PageDown, Enter.

## Чат: голос, перезапуск, связь

- Голос: `useVoiceInput(port)` + порт `VoiceTranscriptionPort` (`transcribe(audio, {signal})`, необязательный `ensureMicrophoneAccess()`); запрос на `POST /transcriptions/voice` и разрешение микрофона — в приложении. Результат `VoiceTranscript` (`text`/`no-speech`) вставляется в поле, автоотправки нет; ошибки — `VoiceError` (коды `VOICE_*`, `microphone-denied`).
- Перезапуск с сообщения: `withReplaceFrom(agent, takePending)` кладёт `forwardedProps.replaceFromMessageId` (рядом с `withFileIds`); `useServerMessageIds` по CUSTOM `user-message-saved` (`USER_MESSAGE_SAVED_EVENT`) знает серверный id вопроса, «Изменить» показывается только при известном id и `editable`. После ответа приложение перечитывает историю (`thread.import`).
- Связь: `useServerReachability` даёт `connection: 'online'|'offline'`; `Thread` получает `connection` и `onProbe` (проверка `GET /health`, колбэк в приложении); при offline Composer заблокирован, черновик остаётся.
- `durationMs` вызова инструмента: из потока считает клиент, из истории берётся `artifact.durationMs` части tool-call (приложение переносит его из ответа `GET /threads/:id/messages`).

## Как добавить компонент

1. Сначала мастер в `design/design-kit.lib.pen` (через `mcp__pencil__*`), состояния и три формата.
2. Компонент в `src/<область>/` (презентационный: данные + колбэки), стили на токенах, иконки из `src/icons.ts`, `cn` из `src/lib/cn.ts`.
3. Тест рядом (`*.test.tsx`) на роли и тексты, не на классы.
4. Экспорт в `src/index.ts`; новые токены — в `tokens.css` и тест-снимок.
5. Платформенный код не добавлять; разная компоновка — через `useLayoutMode`.
6. Проверить в обоих приложениях (CC через electron-stagewright, MH после `npx vite build`).

## Команды

`npm test`, `npm run typecheck`, `npm run lint`.
