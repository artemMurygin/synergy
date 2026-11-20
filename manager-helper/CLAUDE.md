# manager-helper (расширение Chrome)

Стек: Vite + CRX (`manifest.config.ts`), React, assistant-ui (AG-UI), socket.io-client, Zod.

## Структура `src/`

- `sidepanel/` — боковая панель (основной UI), `options/` — страница настроек, `background/` — service worker, `content/` — content scripts.
- `shared/` — клиенты API (`*-api.ts`), auth, notifications, настройки, общие стили (`styles.css`).

## UI Kit

Вид — из `@synergy/ui-kit` (см. `ui-kit/CLAUDE.md`, `.claude/rules/ui-kit.md`); локальных иконок и примитивов нет. `LayoutMode` определяется по ширине панели (`useViewportWidth`). Контейнеры над пакетом:
- `sidepanel/App.tsx` (SidePanelApp), `sidepanel/ChatPane.tsx`, `sidepanel/QuickSearchForm.tsx` (остаётся в MH), `sidepanel/tasks/TasksApp.tsx`, `sidepanel/telegram/TelegramPane.tsx`, `options/App.tsx`, `shared/auth/ui/AuthGate.tsx`;
- `sidepanel/attachments/use-file-upload-port.ts` — XHR + Bearer на `{backendUrl}/files`;
- `shared/files-api.ts` — `downloadFile`: подписанная ссылка, затем `chrome.downloads.download`.

- `sidepanel/voice/use-voice-transcription-port.ts` — `VoiceTranscriptionPort` поверх `shared/voice-api.ts` (`POST /transcriptions/voice`, `authFetch`);
- `mic-permission/` (`index.html`, `main.tsx`, `MicPermissionPage.tsx`) — страница расширения `mic-permission.html`: панель не может показать запрос микрофона, `ensureMicrophoneAccess` открывает эту страницу; добавлена во вход сборки в `vite.config.ts`, новых разрешений в manifest нет;
- `sidepanel/quick-search/` — шторка быстрого подбора: `QuickSearchButton` («Подбор» в слоте `Composer.tools`), `QuickSearchSheet`, `QuickSearchForm`; черновики по чатам только в памяти (`use-quick-search-drafts.ts`).

Разрешение `downloads` в `manifest.config.ts`: при обновлении расширения Chrome покажет запрос нового разрешения, это ожидаемо.

## Тесты и проверка

- `npx vitest run <путь>` во время работы, `npm run typecheck`, `npm run lint`, полный `npm test` в конце.
- Проверка UI — по `.claude/rules/frontend-ui-verification.md` (MCP `extension`, сначала `npx vite build`). Макеты — фрейм Manager Helper в `design/synergy-design.pen`.
