# Manager Helper

Расширение Google Chrome (Manifest V3) на React + TypeScript + Vite + [@crxjs/vite-plugin](https://crxjs.dev).

## Структура

```
manifest.config.ts      манифест расширения (типизированный)
vite.config.ts          Vite + React + Tailwind + CRXJS
src/
  background/           service worker
  content/              content script
  sidepanel/            side panel (React), открывается по клику на иконку
  options/              страница настроек (React)
  shared/               общие типы сообщений, стили
public/icons/           иконки расширения
scripts/                вспомогательные скрипты
```

## Команды

| Команда             | Что делает                              |
| ------------------- | --------------------------------------- |
| `npm run dev`       | dev-сервер с HMR, собирает в `dist/`    |
| `npm run build`     | typecheck + production-сборка в `dist/` |
| `npm run typecheck` | проверка типов                          |
| `npm run lint`      | ESLint                                  |
| `npm run format`    | Prettier                                |
| `npm run icons`     | перегенерировать заглушки иконок        |

## Запуск в Chrome

1. `npm install`
2. `npm run dev`
3. Открыть `chrome://extensions`, включить «Режим разработчика».
4. «Загрузить распакованное расширение» → выбрать папку `dist/`.

Side panel, options и content script обновляются через HMR, service worker перезагружается автоматически.
