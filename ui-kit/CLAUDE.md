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

В CSS приложения: `@import 'tailwindcss'; @import '@synergy/ui-kit/styles.css'; @source "<rel>/ui-kit/src";` (путь `@source` — относительный до `ui-kit/src`).

## Правила

- Только светлая тема: нет `.dark` и `prefers-color-scheme`.
- Новые токены сначала появляются в `design-kit.lib.pen`, затем в `tokens.css` и тесте-снимке.

## Токены «старое -> новое»

Заполняется в группах миграции приложений.

## Команды

`npm test`, `npm run typecheck`, `npm run lint`.
