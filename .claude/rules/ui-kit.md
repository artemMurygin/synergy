---
description: Правила общего UI Kit (@synergy/ui-kit) и его использования в control-center и manager-helper
paths:
  - "ui-kit/**"
  - "control-center/src/renderer/**"
  - "manager-helper/src/**"
---

# UI Kit клиентов

- Вид — только из `@synergy/ui-kit` (компоненты, токены, иконки). Эталон — `design/design-kit.lib.pen`.
- Запрещены локальные токены и цвета: hex в классах, `bg-[#...]`, собственные `@theme`. Токены — из `ui-kit/styles/tokens.css`.
- Запрещены прямые импорты `lucide-react` и `radix-ui` в приложениях; иконки — `@synergy/ui-kit/icons`. Глубокие импорты `@synergy/ui-kit/src/...` запрещены.
- Чат строится на примитивах assistant-ui; `AssistantRuntimeProvider` и `useAgUiRuntime` остаются в приложении.
- Один компонент — разная компоновка по `LayoutMode` (`desktop|tablet|mobile`, `useLayoutMode`); отдельных копий под приложение не делать. CC всегда `desktop`, MH — по ширине панели.
- Платформенный код (запросы, store, Electron IPC, `chrome.*`, загрузка и скачивание файлов) всегда в приложении; в пакет приходят данные и колбэки.
- Новая UI-функциональность чата и оболочки делается в пакете и подключается в оба приложения.
- Голос, перезапуск вопроса (`withReplaceFrom`) и проверка связи (`probe`) — в пакете; в приложении только порты и запросы (`VoiceTranscriptionPort`, `/health`); всплывающие сообщения — `Toast`, а не отдельные копии.
- Тёмной темы нет: без `dark:`, `.dark`, `prefers-color-scheme`.
- Правка пакета проверяется в обоих приложениях (см. `frontend-ui-verification.md`).
